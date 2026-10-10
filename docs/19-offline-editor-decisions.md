# ADR 01: Offline editor document commands

Status: accepted architecture; implementation and acceptance evidence tracked in [the project plan](18-project-plan.md) and [closure review](reviews/offline-closure.md).

## Decision and purpose

Keep portable screen content in workspace version 1 using additive optional widget fields: `locked` is a boolean; `groupId` is a nonempty string. Existing documents with neither field remain editable and ungrouped. Screen count is bounded to 64, with at most 1,000 widgets per screen. Apply these limits at both frontend and native file boundaries.

Groups are screen-local sets of widgets sharing a group ID. There is no separate group table that can become orphaned. A group transform must preserve relative geometry; grouping is more than selecting several IDs. Moving a group produces one undo command. Alignment and distribution use group bounds, including rotation, and preserve each child's relative position. Locked widgets remain selectable but are excluded from geometry changes until unlocked. Mixed locked and unlocked selections must expose predictable behavior and must not silently move locked members.

Screen navigation changes the viewed document without starting another acquisition worker or clearing source values. Shared window commands include a screen identity; receivers validate that identity and the current session before applying changes. Deleting the final screen is prohibited. Deleting another screen removes its widgets in one undoable operation; it never deletes a source solely because that screen referenced it.

The internal clipboard copies portable widget content. Paste and duplicate allocate fresh widget IDs and remap copied group IDs together. Pasting a group preserves relative coordinates. Clipboard bindings must be validated against the destination project; unavailable variables become visibly unbound or the paste is rejected with an explanation. Clipboard state is separate from saved project state and contains no acquired history.

New widget placement searches a bounded number of candidate slots to reduce accidental overlap. It must remain responsive even for extreme but valid canvas sizes. Existing saved positions and intentional overlap remain valid. An overlap warning and arrange commands assist the user without forcing automatic layout.

## Alternatives and compatibility

A separate persisted group table would allow named or nested groups later, but introduces additional reference validation and migration now. Version 2 of the portable document is unnecessary for optional fields whose absence has a clear default. Session dock layout will have its own version and migration contract; it is independent of widget geometry.

No legacy workspace is rewritten until the user saves. A geometry lock is editor policy, independent of variable write permission. Undo restores the full screen content affected by a command, including group identities and order. Active selection is transient and ID-based.

## Failure behavior and validation

Reject malformed IDs, duplicate widget identities, dangling source bindings and out-of-bound counts before replacing the current document. Keep current content intact on save/open failure. A cancelled gesture restores its starting geometry; pointer loss must end or cancel it deterministically. Verify group paste/move/align/distribute, rotated bounds, locked members, screen deletion/undo, zoom-independent coordinates, bounded placement, and native/frontend schema parity. These checks close only their tested AC01/AC02/AC15 subsets; they do not establish complete native docking or three-platform runtime acceptance.
