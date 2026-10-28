# Prompt for interests when the profile is opened, until filled in
## What this changes
An attendee with no stored interests who clicks their name tab gets the interests modal instead of the dropdown. Cancel, Escape or the backdrop skips it: interests stay empty and the normal dropdown opens, and the next open prompts again. Saving at least one topic stops the prompting; saving nothing does not. The dropdown loses its Interests button and gains a small "Edit interests" text link in its header, which opens the same modal pre-filled and never auto-prompts when closed. Nothing changes for the six seeded attendees, who all have interests.
## Where
- `src/components/UserSwitcher.jsx` — the name button's `onClick`: if `currentUser.interests` is empty, `setPrompting(true)` instead of toggling `open`; the `InterestsDialog` `onClose` becomes: close, and if it was a prompt and interests are still empty, `setOpen(true)`. Delete the `open-interests` footer block; add an `Edit interests` `<button>` styled as a text link (`data-testid="edit-interests"`) in the "Viewing as" header, which closes the menu and opens the dialog with `prompting` false. Prompting state is derived from the stored interests, so it survives a reload and is per attendee.
- `tests/switcher.spec.js` — rewrite the `open` helper in the existing Interests test to use `edit-interests`, and replace the `open-interests` visibility assertion; add a test for the prompt using lane `switcher.interests` (`laneFor`, `visit`, `momentOn`), clearing interests with `PUT /api/users/:id/interests` and restoring `original` in `finally`.
- `docs/context/ui.md` — the `UserSwitcher` paragraph (~line 151): describe the prompt and the edit link in place of the `Interests` button.
## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| No Interests button; Edit interests opens the pre-filled modal | `open-interests` count is 0; `edit-interests` opens a dialog with the stored topics pressed | spec (`tests/switcher.spec.js`) |
| Empty interests: profile opens the modal first; skipping opens the dropdown; next open and a reload prompt again | clear via PUT; click name tab, dialog visible, Cancel, listbox visible; close, click again, dialog visible; reload, click, dialog visible | spec |
| After saving a topic the dropdown opens directly, no prompt later | save one topic, click name tab, listbox visible and dialog hidden, repeated | spec |
| Saving an empty selection keeps prompting | Save with nothing chosen, click name tab, dialog visible | spec |
| Switching attendee still works | pick another attendee from the dropdown reached after skipping | spec |
| Tests restore data; existing references updated | `finally` PUTs `original`; no `open-interests` left outside this spec's absence assertion | spec |
| `docs/context/ui.md` describes it | read by the reviewer | docs |
## Decisions
- Prompt on every open while interests are empty, including opens after switching to an empty attendee (not at the switch itself) — OK?
- Skipping via Escape opens the dropdown straight after, rather than leaving the page with nothing open — OK?
- The Edit interests link sits in the existing "Viewing as" header block, below the explanatory line — OK?
## Out of scope
Seed changes, recommended talks on My Agenda, any other visual change to the switcher.
