/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { ModalRoot, ModalSize, openModal } from "@utils/modal";
import { Button, Forms, GuildStore, React, RestAPI, TextInput, UserStore } from "@webpack/common";

type GuildLike = {
    id: string;
    name: string;
    icon?: string | null;
    ownerId?: string;
    memberCount?: number;
    verified?: boolean;
    partnered?: boolean;
};

function getAllGuilds(): GuildLike[] {
    const obj = GuildStore.getGuilds?.() ?? {};
    const arr = Object.values(obj) as any[];
    return arr.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        ownerId: g.ownerId ?? g.owner_id,
        memberCount: g.memberCount ?? g.approximate_member_count,
        verified: !!(g.verified ?? g.isVerified),
        partnered: !!(g.partnered ?? g.isPartnered)
    }));
}

function guildIconUrl(g: GuildLike) {
    if (!g.icon) return null;
    return `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`;
}

function sleep(ms: number) {
    return new Promise<void>(r => setTimeout(r, ms));
}

async function leaveGuild(guildId: string) {
    // Discord route: DELETE /users/@me/guilds/{guild.id}
    return RestAPI.del({ url: `/users/@me/guilds/${guildId}`, oldFormErrors: true });
}

function Chip({ children }: { children: React.ReactNode }) {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 10px",
                borderRadius: 999,
                fontSize: 12,
                background: "var(--background-modifier-accent)",
                color: "var(--text-normal)",
                opacity: 0.92
            }}
        >
            {children}
        </span>
    );
}

function SectionCard({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                border: "1px solid var(--background-modifier-accent)",
                borderRadius: 14,
                background: "var(--background-secondary)",
                overflow: "hidden"
            }}
        >
            {children}
        </div>
    );
}

function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, ...style }}>
            {children}
        </div>
    );
}

function TabButton({
    active,
    onClick,
    children
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid var(--background-modifier-accent)",
                background: active ? "var(--background-modifier-selected)" : "transparent",
                color: "var(--text-normal)",
                cursor: "pointer",
                fontSize: 13
            }}
        >
            {children}
        </button>
    );
}

function BulkLeaveModal(props: any) {
    // Live data
    const [guilds, setGuilds] = React.useState<GuildLike[]>(() => getAllGuilds());
    const [autoRefresh, setAutoRefresh] = React.useState(true);

    // UI state
    const [tab, setTab] = React.useState<"servers" | "log" | "settings">("servers");
    const [query, setQuery] = React.useState("");
    const [selected, setSelected] = React.useState<Record<string, boolean>>({});
    const [busy, setBusy] = React.useState(false);

    // Filters
    const [hideVerified, setHideVerified] = React.useState(false);
    const [hideLarge, setHideLarge] = React.useState(false);
    const [largeThreshold, setLargeThreshold] = React.useState(10000);
    const [hideOwned, setHideOwned] = React.useState(true);
    const [showSelectedOnly, setShowSelectedOnly] = React.useState(false);

    // Sort
    const [sortMode, setSortMode] = React.useState<"name" | "members_desc" | "members_asc">("name");

    // Safety + execution
    const [confirmText, setConfirmText] = React.useState("");
    const [requireConfirmOver, setRequireConfirmOver] = React.useState(10);
    const [delayMs, setDelayMs] = React.useState(450);
    const cancelRef = React.useRef(false);

    // Logging
    const [log, setLog] = React.useState<Array<{ ok: boolean; text: string }>>([]);
    const [progress, setProgress] = React.useState({ done: 0, total: 0 });

    // current user for owned detection
    const currentUserId = UserStore.getCurrentUser?.()?.id;

    // Auto refresh guild list while modal is open
    React.useEffect(() => {
        if (!autoRefresh) return;

        const t = setInterval(() => {
            setGuilds(prev => {
                const next = getAllGuilds();
                // Avoid rerender spam if identical length and ids
                if (prev.length === next.length) {
                    let same = true;
                    for (let i = 0; i < prev.length; i++) {
                        if (prev[i].id !== next[i].id) {
                            same = false;
                            break;
                        }
                    }
                    if (same) return prev;
                }
                return next;
            });
        }, 1000);

        return () => clearInterval(t);
    }, [autoRefresh]);

    const selectedIds = React.useMemo(
        () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
        [selected]
    );

    function isOwned(g: GuildLike) {
        return !!(currentUserId && g.ownerId && g.ownerId === currentUserId);
    }

    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase();

        let list = guilds;

        if (hideOwned && currentUserId) {
            list = list.filter(g => !isOwned(g));
        }

        if (hideVerified) {
            list = list.filter(g => !(g.verified || g.partnered));
        }

        if (hideLarge) {
            list = list.filter(g => typeof g.memberCount !== "number" || g.memberCount < largeThreshold);
        }

        if (q) {
            list = list.filter(g => g.name.toLowerCase().includes(q) || g.id.includes(q));
        }

        if (showSelectedOnly) {
            const sel = selected;
            list = list.filter(g => !!sel[g.id]);
        }

        list = [...list];
        if (sortMode === "name") {
            list.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortMode === "members_desc") {
            list.sort((a, b) => (b.memberCount ?? -1) - (a.memberCount ?? -1));
        } else {
            list.sort((a, b) => (a.memberCount ?? 1e18) - (b.memberCount ?? 1e18));
        }

        return list;
    }, [
        guilds,
        query,
        hideOwned,
        hideVerified,
        hideLarge,
        largeThreshold,
        showSelectedOnly,
        sortMode,
        selected,
        currentUserId
    ]);

    function toggle(id: string) {
        setSelected(prev => ({ ...prev, [id]: !prev[id] }));
    }

    function selectAllShown() {
        setSelected(prev => {
            const next = { ...prev };
            for (const g of filtered) next[g.id] = true;
            return next;
        });
    }

    function clearSelection() {
        setSelected({});
    }

    function invertShown() {
        setSelected(prev => {
            const next = { ...prev };
            for (const g of filtered) next[g.id] = !next[g.id];
            return next;
        });
    }

    function reloadNow() {
        setGuilds(getAllGuilds());
        setLog(prev => [{ ok: true, text: "🔄 Reloaded server list." }, ...prev]);
    }

    const needsConfirm = selectedIds.length >= requireConfirmOver;

    async function doLeaveSelected() {
        const ids = selectedIds;

        if (ids.length === 0) {
            setLog(prev => [{ ok: false, text: "⚠️ Select at least one server first." }, ...prev]);
            setTab("log");
            return;
        }

        if (needsConfirm && confirmText.trim().toUpperCase() !== "LEAVE") {
            setLog(prev => [{ ok: false, text: `⚠️ Type LEAVE to confirm leaving ${ids.length} servers.` }, ...prev]);
            setTab("log");
            return;
        }

        cancelRef.current = false;
        setBusy(true);
        setProgress({ done: 0, total: ids.length });
        setLog(prev => [{ ok: true, text: `▶️ Starting: leaving ${ids.length} server(s)…` }, ...prev]);
        setTab("log");

        for (let i = 0; i < ids.length; i++) {
            if (cancelRef.current) {
                setLog(prev => [{ ok: false, text: "⏹ Cancelled by user." }, ...prev]);
                break;
            }

            const id = ids[i];
            const g = guilds.find(x => x.id === id);
            const name = g?.name ?? id;

            // Skip owned (Discord blocks it), but be explicit
            if (g && isOwned(g)) {
                setLog(prev => [{ ok: false, text: `⛔ Skipped (owned): ${name}` }, ...prev]);
                setProgress({ done: i + 1, total: ids.length });
                continue;
            }

            try {
                await leaveGuild(id);
                setLog(prev => [{ ok: true, text: `✅ Left: ${name}` }, ...prev]);
            } catch (e: any) {
                const msg = String(e?.message ?? e);
                setLog(prev => [{ ok: false, text: `❌ Failed: ${name} (${msg})` }, ...prev]);
            }

            setProgress({ done: i + 1, total: ids.length });
            await sleep(delayMs);
        }

        setBusy(false);
        setConfirmText("");
    }

    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

    const Header = (
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <Row style={{ justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Forms.FormTitle>Bulk Leave Servers</Forms.FormTitle>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <Chip>Selected: {selectedIds.length}</Chip>
                        <Chip>Shown: {filtered.length}</Chip>
                        {busy ? <Chip>Leaving… {pct}%</Chip> : <Chip>Ready</Chip>}
                        {autoRefresh ? <Chip>Auto-refresh: ON</Chip> : <Chip>Auto-refresh: OFF</Chip>}
                    </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <TabButton active={tab === "servers"} onClick={() => setTab("servers")}>Servers</TabButton>
                    <TabButton active={tab === "log"} onClick={() => setTab("log")}>Log</TabButton>
                    <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>Settings</TabButton>
                </div>
            </Row>

            <Row style={{ flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                    <TextInput
                        value={query}
                        onChange={(v: string) => setQuery(v)}
                        placeholder="Search by server name or ID…"
                        disabled={busy}
                    />
                </div>

                <Button onClick={selectAllShown} disabled={busy || filtered.length === 0}>
                    Select shown
                </Button>
                <Button onClick={invertShown} disabled={busy || filtered.length === 0}>
                    Invert shown
                </Button>
                <Button onClick={clearSelection} disabled={busy || selectedIds.length === 0}>
                    Clear selection
                </Button>
                <Button onClick={reloadNow} disabled={busy}>
                    Reload
                </Button>
            </Row>
        </div>
    );

    const Footer = (
        <div
            style={{
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--background-tertiary)",
                borderTop: "1px solid var(--background-modifier-accent)"
            }}
        >
            <div style={{ fontSize: 13, opacity: 0.9 }}>
                {busy ? `Leaving… ${progress.done}/${progress.total}` : `Ready. ${needsConfirm ? "Type LEAVE to confirm." : ""}`}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {busy && (
                    <Button onClick={() => { cancelRef.current = true; }}>
                        Cancel
                    </Button>
                )}
                <Button onClick={doLeaveSelected} disabled={busy || selectedIds.length === 0}>
                    Leave selected
                </Button>
            </div>
        </div>
    );

    const ServersTab = (
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionCard>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    <Row style={{ flexWrap: "wrap" }}>
                        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, opacity: 0.9 }}>
                            <input
                                type="checkbox"
                                checked={hideOwned}
                                onChange={e => setHideOwned(e.currentTarget.checked)}
                                disabled={busy || !currentUserId}
                            />
                            Hide owned (recommended)
                        </label>

                        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, opacity: 0.9 }}>
                            <input
                                type="checkbox"
                                checked={hideVerified}
                                onChange={e => setHideVerified(e.currentTarget.checked)}
                                disabled={busy}
                            />
                            Hide verified/partnered
                        </label>

                        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, opacity: 0.9 }}>
                            <input
                                type="checkbox"
                                checked={hideLarge}
                                onChange={e => setHideLarge(e.currentTarget.checked)}
                                disabled={busy}
                            />
                            Hide big servers
                        </label>

                        {hideLarge && (
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={{ fontSize: 13, opacity: 0.85 }}>Threshold:</span>
                                <input
                                    type="number"
                                    min={100}
                                    step={100}
                                    value={largeThreshold}
                                    onChange={e => setLargeThreshold(Math.max(100, Number(e.currentTarget.value || 10000)))}
                                    disabled={busy}
                                    style={{
                                        width: 110,
                                        padding: "6px 8px",
                                        borderRadius: 8,
                                        border: "1px solid var(--background-modifier-accent)",
                                        background: "var(--background-secondary)",
                                        color: "var(--text-normal)"
                                    }}
                                />
                            </div>
                        )}
                    </Row>

                    <Row style={{ flexWrap: "wrap" }}>
                        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, opacity: 0.9 }}>
                            <input
                                type="checkbox"
                                checked={showSelectedOnly}
                                onChange={e => setShowSelectedOnly(e.currentTarget.checked)}
                                disabled={busy}
                            />
                            Show selected only
                        </label>

                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 13, opacity: 0.85 }}>Sort:</span>
                            <select
                                value={sortMode}
                                onChange={e => setSortMode(e.currentTarget.value as any)}
                                disabled={busy}
                                style={{
                                    padding: "6px 8px",
                                    borderRadius: 8,
                                    border: "1px solid var(--background-modifier-accent)",
                                    background: "var(--background-secondary)",
                                    color: "var(--text-normal)"
                                }}
                            >
                                <option value="name">Name</option>
                                <option value="members_desc">Members (high → low)</option>
                                <option value="members_asc">Members (low → high)</option>
                            </select>
                        </div>
                    </Row>
                </div>
            </SectionCard>

            <SectionCard>
                <div style={{ maxHeight: 420, overflow: "auto", background: "var(--background-secondary)" }}>
                    {filtered.map((g, idx) => {
                        const icon = guildIconUrl(g);
                        const isSel = !!selected[g.id];
                        const owned = isOwned(g);

                        return (
                            <div
                                key={g.id}
                                onClick={() => !busy && toggle(g.id)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "10px 12px",
                                    cursor: busy ? "not-allowed" : "pointer",
                                    background: isSel ? "var(--background-modifier-selected)" : "transparent",
                                    borderBottom: idx === filtered.length - 1 ? "none" : "1px solid var(--background-modifier-accent)"
                                }}
                                onMouseEnter={e => {
                                    if (!busy && !isSel) e.currentTarget.style.background = "var(--background-modifier-hover)";
                                }}
                                onMouseLeave={e => {
                                    if (!busy && !isSel) e.currentTarget.style.background = "transparent";
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSel}
                                    onChange={() => toggle(g.id)}
                                    onClick={e => e.stopPropagation()}
                                    disabled={busy}
                                />

                                <div
                                    style={{
                                        width: 34,
                                        height: 34,
                                        borderRadius: 999,
                                        overflow: "hidden",
                                        background: "var(--background-modifier-accent)",
                                        flex: "0 0 auto",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 12,
                                        opacity: 0.95
                                    }}
                                >
                                    {icon ? (
                                        <img src={icon} width={34} height={34} style={{ display: "block" }} />
                                    ) : (
                                        <span>{g.name.slice(0, 2).toUpperCase()}</span>
                                    )}
                                </div>

                                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                                    <span style={{ fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {g.name}
                                    </span>
                                    <span style={{ opacity: 0.7, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {g.id}
                                        {typeof g.memberCount === "number" ? ` • ${g.memberCount.toLocaleString()} members` : ""}
                                        {g.verified ? " • verified" : ""}
                                        {g.partnered ? " • partnered" : ""}
                                        {owned ? " • OWNED" : ""}
                                    </span>
                                </div>
                            </div>
                        );
                    })}

                    {filtered.length === 0 && (
                        <div style={{ padding: 14, opacity: 0.7 }}>No servers match.</div>
                    )}
                </div>
            </SectionCard>
        </div>
    );

    const LogTab = (
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionCard>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <Chip>{busy ? `Progress: ${pct}%` : "No active run"}</Chip>
                            <Chip>{busy ? `${progress.done}/${progress.total}` : `${log.length} log line(s)`}</Chip>
                        </div>
                        <Button onClick={() => setLog([])} disabled={busy || log.length === 0}>
                            Clear log
                        </Button>
                    </Row>

                    {needsConfirm && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <Forms.FormText>
                                Safety: You selected {selectedIds.length} servers. Type <b>LEAVE</b> to enable the button.
                            </Forms.FormText>
                            <TextInput
                                value={confirmText}
                                onChange={(v: string) => setConfirmText(v)}
                                placeholder="Type LEAVE to confirm…"
                                disabled={busy}
                            />
                        </div>
                    )}
                </div>
            </SectionCard>

            <SectionCard>
                <div
                    style={{
                        padding: 10,
                        maxHeight: 420,
                        overflow: "auto",
                        fontFamily: "var(--font-code)",
                        background: "var(--background-secondary)"
                    }}
                >
                    {log.length === 0 ? (
                        <div style={{ opacity: 0.7 }}>No log yet. Start a run and results will appear here.</div>
                    ) : (
                        log.map((line, idx) => (
                            <div key={idx} style={{ fontSize: 12, padding: "2px 0", opacity: line.ok ? 0.95 : 0.85 }}>
                                {line.text}
                            </div>
                        ))
                    )}
                </div>
            </SectionCard>
        </div>
    );

    const SettingsTab = (
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionCard>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                    <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                        <div>
                            <Forms.FormTitle tag="h3">Execution</Forms.FormTitle>
                            <Forms.FormText>Controls for rate limits + safety.</Forms.FormText>
                        </div>
                    </Row>

                    <Row style={{ flexWrap: "wrap" }}>
                        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, opacity: 0.9 }}>
                            Delay (ms) between leaves:
                            <input
                                type="number"
                                min={0}
                                step={50}
                                value={delayMs}
                                onChange={e => setDelayMs(Math.max(0, Number(e.currentTarget.value || 450)))}
                                disabled={busy}
                                style={{
                                    width: 110,
                                    padding: "6px 8px",
                                    borderRadius: 8,
                                    border: "1px solid var(--background-modifier-accent)",
                                    background: "var(--background-secondary)",
                                    color: "var(--text-normal)"
                                }}
                            />
                        </label>

                        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, opacity: 0.9 }}>
                            Require typing LEAVE at:
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={requireConfirmOver}
                                onChange={e => setRequireConfirmOver(Math.max(1, Number(e.currentTarget.value || 10)))}
                                disabled={busy}
                                style={{
                                    width: 90,
                                    padding: "6px 8px",
                                    borderRadius: 8,
                                    border: "1px solid var(--background-modifier-accent)",
                                    background: "var(--background-secondary)",
                                    color: "var(--text-normal)"
                                }}
                            />
                            servers+
                        </label>
                    </Row>

                    <Row style={{ flexWrap: "wrap" }}>
                        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, opacity: 0.9 }}>
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={e => setAutoRefresh(e.currentTarget.checked)}
                                disabled={busy}
                            />
                            Auto-refresh server list (recommended)
                        </label>
                    </Row>

                    <Forms.FormText>
                        If some servers “don’t show”, leave auto-refresh ON and hit Reload once.
                        Discord sometimes loads guild data lazily.
                    </Forms.FormText>
                </div>
            </SectionCard>
        </div>
    );

    return (
        <ModalRoot {...props} size={ModalSize.LARGE}>
            <div style={{ padding: 0, display: "flex", flexDirection: "column", gap: 0 }}>
                {/* Sticky header */}
                <div
                    style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 2,
                        background: "var(--background-primary)",
                        borderBottom: "1px solid var(--background-modifier-accent)"
                    }}
                >
                    {Header}
                </div>

                {/* Body */}
                <div style={{ padding: 0 }}>
                    {tab === "servers" ? ServersTab : tab === "log" ? LogTab : SettingsTab}
                </div>

                {/* Sticky footer */}
                <div style={{ position: "sticky", bottom: 0, zIndex: 2 }}>
                    {Footer}
                </div>
            </div>
        </ModalRoot>
    );
}

export default definePlugin({
    name: "BulkLeaveGuild",
    description: "The best bulk leave tool: live refresh, filters, sorting, safety confirm, and clear logging.",
    authors: [{ name: "You", id: 0n }],

    settingsAboutComponent: () => (
        <>
            <Forms.FormTitle tag="h3">Bulk Leave Servers</Forms.FormTitle>
            <Forms.FormText>
                Opens the bulk leave tool (with filters, sorting, safety confirmation, and logs).
            </Forms.FormText>
            <Button style={{ marginTop: 8 }} onClick={() => openModal(p => <BulkLeaveModal {...p} />)}>
                Open Bulk Leave Tool
            </Button>
        </>
    )
});
