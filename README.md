<img width="1667" height="990" alt="image" src="https://github.com/user-attachments/assets/d65c7057-18da-48fe-b00e-5361e5d1cff8" />
# Bulk Leave Servers (Vencord Userplugin)

A Vencord **userplugin** that lets you **select multiple servers** and leave them in bulk from a clean UI inside **User Settings → Vencord → Plugins**.

> ⚠️ This is a client-side tool for your own account. Use responsibly.

---

## Features

- ✅ List all servers you’re in (sorted A–Z)
- ✅ Search by **name** or **ID**
- ✅ Multi-select with checkboxes
- ✅ **Select all / Invert / Clear**
- ✅ Optional filters (example: hide verified / hide large servers)
- ✅ Progress indicator + live log
- ✅ Cancel button
- ✅ Rate-limit friendly delay between leaves

---

## Where it appears in Discord

**User Settings → Vencord → Plugins → BulkLeaveGuild → Open Tool**

---

## Install (Userplugin)

1. Make sure you have the Vencord repo cloned and working (pnpm recommended).
2. Create this folder if it doesn’t exist:
3. Put your plugin file here:
4. Build + inject:

```bat
cd %USERPROFILE%\Documents\Vencord
pnpm run build
pnpm run inject


