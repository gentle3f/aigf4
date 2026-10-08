# AIGF UI 2.0 Live Test Handoff — 2026-10-07

## Supabase migration status

The new Supabase backend is fully verified and data-complete.

Final NEW project verification:
- auth users: 1
- state rows: 1
- conversations: 29
- conversation message_count sum: 11086
- message rows: 11086
- media rows: 45
- private storage objects: 45
- research turns: 4
- large Wetapp tables in Realtime: 0

Old baseline before reseed:
- conversations: 29
- messages: 11079
- media: 45
- storage objects: 45

The +7 messages in the new project are consistent with activity after the old-project audit. Conversation-declared total exactly matches physical message rows. Media counts match exactly. Supabase cutover is complete.

## UI 2.0 work

User felt the existing Wetapp UI looked old-tech. Existing primary chat skin in `mori.css` is strongly WhatsApp-Web-like.

A standalone visual prototype was first created locally under:
- `prototypes/wetapp-ui-v2/index.html`

User liked the direction but wanted to test it with real functions on phone.

### Real functional UI 2.0 test

Implemented an opt-in visual layer on the real Wetapp app:
- `ui-v2.css`
- query gate added in `index.html`
- activation: `?ui=v2`
- default URL remains on the existing UI

Important:
- same production app
- same chat / Group / Cc / memory / media / Supabase / review logic
- UI 2.0 is CSS + shell presentation only
- no separate dummy data or backend
- normal URL is unaffected because all UI 2.0 rules are gated under `html[data-wetapp-ui="v2"]`

Design direction:
- warm contemporary relationship-first messenger
- reduce WhatsApp clone feel
- cleaner conversation list
- softer warm canvas
- dark user bubbles / light character bubbles
- editorial narration treatment
- improved Group speaker hierarchy
- floating composer
- modern desktop popover and mobile bottom-sheet treatment
- shared modal/sheet modernisation
- small `UI 2.0 TEST` marker while testing

Validation:
- full suite: 666/666 PASS
- typecheck PASS
- production build PASS
- added `tests/uiV2Gate.test.ts` to verify opt-in gate and scoped stylesheet

Commit:
- `48d0eed Add opt-in Wetapp UI 2.0`

Production deployment:
- `dpl_8BntRVTVvtuo5jjNmq5TV4Mc5fH2`
- READY
- aliases include `wetapp.madproduction.ai`

User can test the live functional version on phone by opening the normal Wetapp production URL with `?ui=v2`.

## Current product work

Group Reply V2 is still waiting for more real Research Capture baseline usage. UI/UX work can continue in parallel without changing Group reply logic.

## Operating rules

- GEN-FUJI Local MCP only for local filesystem/repo/command work.
- No Remote Desktop Commander.
- No Codex quota.
- Do not weaken MCP safety.
- Do not re-enable row-level Realtime for the four large Wetapp tables.
- Preserve existing app behaviour while iterating UI 2.0.


## UI 2.0 phone feedback refinement

User feedback from live phone testing:
- remove the trash-bin affordance beside every conversation;
- fix the four-head Group avatar proportions in the chat header;
- the three-dot menu on phone must expose/scroll through every function;
- remove the composer camera shortcut because the user does not use it.

Implemented in opt-in UI 2.0 only:
- conversation delete buttons are visually hidden and their reserved right padding is reclaimed;
- Group header avatar grid now uses fixed square 2x2 cells with nested images at 100% x 100% and object-fit: cover;
- mobile three-dot menu now spans the safe-area viewport and is independently touch-scrollable;
- composer camera button is visually hidden.

No chat, Group, media, deletion, Supabase, memory, or review logic was changed.

Validation after refinement:
- 667/667 tests PASS
- typecheck PASS
- production build PASS

Commit:
- `004fee8 Refine mobile UI 2.0 controls`

Production deployment:
- `dpl_C9kJUPh48RHvz2J3xdiqozy1DT4n`
- READY
- `wetapp.madproduction.ai` alias active.


## UI 2.0 grouped chat action menu

After fixing the mobile menu visibility/portal issue, the user noted the menu was still the old long list.

Implemented:
- UI 2.0 only: existing menu buttons are dynamically regrouped into four sections while preserving original element IDs and event listeners.
- Sections:
  - 關係: room info, DM member, invite/leave, memory, persona settings, Cc model settings.
  - 場景: new scene, surprise event.
  - 媒體: album/media, attach file, change avatar, character photo.
  - 管理: download images, save chat, save all chats, clear chat.
- Each section renders as a 2-column tile grid instead of one vertical list.
- Group-only/conditional buttons keep their existing hidden state semantics.
- Desktop menu width expanded for the grouped layout; mobile retains the viewport-level portaled sheet.

Validation:
- 669/669 tests PASS
- typecheck PASS
- production build PASS

Commit:
- `f7fd5dc Group UI 2.0 chat actions`

Production deployment:
- `dpl_ATYaH2EqmJU1WUoBR2nYsFzYMhnm`
- READY
- `wetapp.madproduction.ai` alias active.


## UI 2.0 Home rebuild

Implemented the first remaining major UI 2.0 phase: true Home / conversation-list restructuring.

Changes:
- Image Studio and Video Studio are no longer visually treated as fake chat rows in UI 2.0.
- Their existing real buttons/IDs are physically moved at runtime into a new Quick Actions section directly below search.
- Quick Actions render as two compact capability tiles with their own icon surfaces, title and supporting text.
- Venice AI remains in the assistant/conversation area because it is a real chat surface.
- Home section labels are simplified to 助手 and 最近.
- Dynamic conversation rows now identify themselves as persona, group, or assistant rows.
- Group conversations receive a distinct visual treatment and a 群組 badge, while persona rows remain cleaner.
- Existing event handlers and tool functionality are preserved; default UI remains unchanged.

Validation:
- 670/670 tests PASS
- typecheck PASS
- production build PASS

Commit:
- `aa31599 Rebuild UI 2.0 home actions`

Production deployment:
- `dpl_3ryr6PL8i2Mu1pUFDqjixTdEtar1`
- READY
- `wetapp.madproduction.ai` alias active.


## UI 2.0 chat-menu categorisation + close control

Phone feedback clarified that the uncategorised top rows were dynamically created actions:
- 互動偏好
- 導演一下
- 幫我接戲
- 目前場景與衣著
- 最近文字用量
- Performance 診斷
- Jev Shadow

These buttons previously had no stable IDs and therefore sat outside the grouped UI 2.0 layout.

Implemented:
- stable IDs assigned to all seven dynamic actions;
- grouped menu expanded to meaningful sections:
  - 互動: 互動偏好, 導演一下, 幫我接戲
  - 角色: 聊天室資料, 私訊群組成員, 邀請角色加入, 請角色離場, 人格設定, 更換角色頭像
  - 場景: 目前場景與衣著, 新場景, 驚喜事件牌
  - 記憶: 靈魂與記憶
  - 媒體: 媒體／連結／文件, 附加檔案, 請角色拍照
  - 工具: 最近文字用量, Performance 診斷, Jev Shadow, Cc 模型設定
  - 管理: 下載圖片, 儲存對話, 儲存所有對話, 清除對話
- added an explicit sticky × close button in the menu header;
- desktop menu also has viewport-bounded height and independent scrolling.

Validation:
- 671/671 tests PASS
- typecheck PASS
- production build PASS

Commit:
- `0dcadbc Organize UI 2.0 chat menu actions`

Production deployment:
- `dpl_5TB3pMnae5mmzdnvCnyGdvDv5UxA`
- READY
- `wetapp.madproduction.ai` alias active.


## UI 2.0 one-on-one message redesign

Implemented the next major visual phase after Home/menu work.

Goal:
- remove the remaining WhatsApp-like white-bubble feel from ordinary 1-on-1 character replies;
- preserve user bubbles, Group rendering, Venice Assistant rendering, attachments and message logic.

Changes:
- ordinary 1-on-1 character bot replies receive semantic classes `character-chat-turn` and `character-message-surface`;
- character name is rendered as a small accent speaker label;
- avatar becomes a compact rounded identity anchor;
- character reply surface is transparent with no card shadow/radius;
- body text receives more open line-height and width;
- mobile gets dedicated proportions;
- user messages remain dark bubbles;
- Group chat and Venice Assistant are intentionally unchanged.

Validation:
- 672/672 tests PASS
- typecheck PASS
- production build PASS

Commit:
- `ba94ea2 Open up UI 2.0 character replies`

Production deployment:
- `dpl_92HvDs2jWE9FMhaCrQ7Ao9M8RetT`
- READY
- `wetapp.madproduction.ai` alias active.

Next visual phase after user reviews this:
- motion/native feel: page/chat transition, message entrance, composer send feedback, sheet motion, reduced-motion safe fallback.


## UI 2.0 complete visual pass

After the user approved the open-text 1-on-1 message direction, the remaining visual vision was implemented in one pass.

### Persona-driven accent / aura
- UI 2.0 now derives a stable low-saturation accent palette from the active conversation identity.
- The same persona/room receives the same accent consistently.
- Accent affects speaker labels and the subtle chat aura.
- No image colour extraction or extra network/model work is used.
- Returning Home clears the per-conversation accent back to the neutral default.

### Motion / native feel
- Chat view entrance animation.
- New-message entrance animation applies only to newly appended live messages, not restored history.
- Composer send gets a short tactile pulse.
- More-options popover and mobile bottom-sheet opening animation.
- Shared sheets get a short spring-like entrance.
- Button press/hover micro-feedback.
- All motion respects `prefers-reduced-motion: reduce`.

### Home stronger differentiation
- The newest recent conversation is rendered as a larger featured identity card in UI 2.0.
- This is in addition to the prior true Quick Actions split for Image Studio / Video Studio and the Group visual badge.

### Optional dark mode
- UI 2.0 now includes an optional warm dark theme rather than cyber/neon dark.
- Toggle is added to the Home menu only in UI 2.0.
- Choice persists in `localStorage` under `wetappUiV2Theme`.
- The theme is restored in the head query-gate script before CSS paint to avoid a light-theme flash.
- Default remains warm light.

### Safety / scope
- Group Reply generation/review logic remains unchanged.
- Group Research Capture remains observational.
- Default URL remains the old UI; UI 2.0 still requires `?ui=v2`.
- Supabase / memory / media / Cc behaviour unchanged.

Validation:
- 676/676 tests PASS
- typecheck PASS
- production build PASS

Commit:
- `15c1224 Complete UI 2.0 motion and theming`

Production deployment:
- `dpl_B6YoTYfEj2eLpXeCJtRKQjxPLvrx`
- READY
- `wetapp.madproduction.ai` alias active.

At this point the original UI 2.0 vision is substantially implemented. Next work should be driven by hands-on phone/desktop feedback rather than adding more speculative visual changes.


## Dark-mode Group contrast fix

User found Group chat text remained black in UI 2.0 dark mode and was nearly unreadable.

Root cause:
- legacy Group renderer still applied `--wa-*` text colors inside `.group-story-*` elements, overriding the general dark-mode surface styling.

Fixed:
- Group dialogue and dialogue text now use `--v2-ink` in dark mode;
- narration uses a dedicated readable muted light tone;
- narrator label and speaker labels receive dark-mode-safe colors;
- narration divider is adjusted for dark background;
- existing 1-on-1 character text already uses the dark-mode `--v2-ink` rule and is covered by regression.

Validation:
- 677/677 tests PASS
- typecheck PASS
- production build PASS

Commit:
- `84b3bba Fix UI 2.0 dark Group contrast`

Production deployment:
- `dpl_8z9unCnmaK4cKr89nYpzJQE7xcjm`
- READY
- `wetapp.madproduction.ai` alias active.


## Dark-mode Home menu contrast fix

User found Home menu text remained black in UI 2.0 dark mode.

Root cause:
- base `.wa-popover button` / `.new-chat-menu button` rules still used legacy `--wa-ink`.

Fixed:
- Home menu buttons now use `--v2-ink` in dark mode.
- New-chat creation menu buttons receive the same fix proactively.
- Hover states use dark-safe background and text.

Validation:
- 678/678 tests PASS
- typecheck PASS
- production build PASS

Commit:
- `215e925 Fix UI 2.0 dark Home menu contrast`

Production deployment:
- `dpl_BLZQDQt7U353Nn5ZHK13vma5SMSK`
- READY
- `wetapp.madproduction.ai` alias active.


## Composer growth + reply-scroll refinement

User feedback:
- persona aura was too subtle to be perceptually useful for a color-weak user;
- composer showed an awkward clipped scrollbar when text became long;
- while waiting for a reply, loading/auditing state pulled the chat back to the bottom, interrupting reading of older messages.

Implemented:
- persona aura remains decorative only; future identity cues must not rely on color alone.
- UI 2.0 composer now auto-grows from 44px to 136px before enabling internal scrolling.
- internal scrollbar uses a thin complete track with inset margins; dark mode receives a matching thumb.
- removed forced chat-bottom scrolling from loading/queueing/retrying state changes.
- loading indicator is now an absolute floating status pill, so showing/hiding it does not change chat viewport height.
- actual bot message insertion still uses the existing message scroll behavior, so the viewport moves only when the real reply becomes visible.

Validation:
- 680/680 tests PASS
- typecheck PASS
- production build PASS

Commit:
- `df8a117 Refine composer growth and reply scrolling`

Production deployment:
- `dpl_J9QtB4eXZy42dWdcjKKzoveAsXJv`
- READY
- `wetapp.madproduction.ai` alias active.


## Immersive Scene Mode v1

User approved trying a more immersive Group presentation after deciding the normal UI 2.0 was good but still somewhat expected.

Relationship-layer design distinction agreed:
- soul = who the character is;
- memory = what happened;
- future relationship fingerprint = repeated interaction patterns that emerge specifically between user and character(s), not another biography.

Implemented UI-only Immersive Scene Mode for Group rooms:
- persisted setting key: `wetappUiV2ImmersiveScene`;
- mode is available only in UI v2 Group chats;
- default is enabled unless user explicitly turns it off;
- a topbar Scene toggle switches between standard and immersive presentation;
- Scene shell shows current location, reality layer, present-member count, user + present cast;
- "此刻" expands existing room scene summary and unresolved threads;
- cast rail uses avatar + name, and active speaker is indicated by vertical movement, border, heavier text and an explicit `說話中` label so it does not rely on color;
- live Group replies stage each segment at 220ms intervals;
- restored/history messages are not replayed because staging requires `target === chatContainer`;
- cast rail briefly tracks staged live speakers;
- narration becomes an environmental prose line rather than a normal speaker message;
- immersive mode visually recedes the normal topbar and opens the Group story surface;
- dark mode and reduced-motion fallbacks included;
- room scene persistence and presence toggles refresh the Scene shell immediately.

No changes to:
- Group generation/prompt/reviewer logic;
- Research Capture;
- Supabase;
- memory or soul semantics;
- Cc;
- ordinary V1 UI.

Validation:
- 684/684 tests PASS
- typecheck PASS
- production build PASS

Functional commit:
- `5538b37 Add immersive Group scene mode`

Production deployment:
- `dpl_Cv9i9aWVBUqsnxXJq5wCaSW9Trrh`
- READY
- `wetapp.madproduction.ai` alias active.


## Immersive Scene v1.1 — World State + Character Insight

User approved trying two extensions to Immersive Scene Mode:
1. expanded "此刻" should show who is doing what, posture and wardrobe;
2. tapping a cast avatar should expose a short fictional character inner state / chemistry view without a second model call.

Implemented:
- `RoomSceneState.memberStates` persisted per room/member with:
  - posture
  - action
  - attention
  - innerThought
  - chemistry
- Room normalization preserves/sanitizes these fields.
- Group generation output protocol now asks for `member_states` inside the existing <scene> JSON for every present member.
- This does NOT add another model request. The fields are generated in the same Group generation response.
- Prompt carries prior member state into the next turn as PRIVATE SCENE-ENGINE state.
- Strong privacy rule in prompt: one character cannot know another character's private inner thought unless visibly revealed.
- Inner thought is a fictional roleplay state, not model chain-of-thought.
- On strict-review revision, the accepted candidate's memberStates are preserved so a reviewer rewrite does not erase them.
- Traditional-Chinese normalization also covers all member-state text.

UI:
- Expanded "此刻" now renders a WORLD STATE list for each present member:
  - 姿勢
  - 動作
  - 衣著
- For existing scenes with no generated state yet, UI explicitly says the field will begin recording after the next Group reply rather than inventing data.
- Cast members are now clickable.
- Tap a member avatar/name to open a compact private X-ray panel:
  - 內心
  - 注意
  - Chemistry
- Clicking the same member closes it; a close button is also provided.
- The inspected cast member gets a non-color-only selected treatment.
- Dark mode + mobile layouts included.

Validation:
- 687/687 tests PASS
- typecheck PASS
- production build PASS

Functional commit:
- `34739d9 Add Group world state and character insight`

Production:
- `dpl_HXFRUELBjjGX2Fw9o8mWk31LvxnG`
- READY
- `wetapp.madproduction.ai` alias active.

Expected test:
- open a UI v2 Group;
- send one fresh turn so member_states are generated;
- expand "此刻" and verify posture/action/wardrobe;
- tap different cast members and verify inner thought/attention/chemistry switch instantly without another loading state/model request.


## Immersive Scene v1.1 bugfix after first real user test

Observed by user:
- expanding 「此刻」 could not scroll;
- tapping a cast avatar only showed a black/selected border, no X-ray panel;
- posture/action were not being detected/populated reliably;
- user asked whether chemistry is directly visible or only indirectly felt through generated dialogue.

Root causes / fixes:
1. X-ray panel lived inside the hidden `#ui-v2-scene-detail`. Cast click changed selected styling but did not open its hidden parent.
   - cast click now explicitly opens detail, sets the 「此刻」 toggle expanded state, renders the selected member insight, and scrolls it into view.
2. Scene detail had no bounded vertical scrolling.
   - `.v2-scene-detail` now has viewport-aware max-height, `overflow-y:auto`, contained overscroll and a thin scrollbar; mobile uses 52dvh.
3. `member_states` parsing was too strict.
   - parser now accepts array or object maps;
   - accepts snake_case and camelCase `member_id/memberId` and `inner_thought/innerThought`.
4. Added visible-reply fallback for posture/action when generated member state is missing.
   - only narration whose subject clearly begins with that member identity can be attributed to the member;
   - posture is extracted only from explicit posture language;
   - if a member spoke but has no attributable physical narration, action may safely fall back to 「正在參與目前對話」;
   - inner thought and chemistry are NOT guessed from visible text.
   - Regression caught and fixed an attribution bug where `IU ... looks at Jennie` could incorrectly be treated as Jennie's action.

Chemistry UX contract:
- chemistry is directly visible in the cast-member X-ray panel;
- it is also persisted into the next Group prompt so it can be felt indirectly through subsequent dialogue/reactions;
- no second model request is made when opening X-ray.

Validation after fix:
- 690/690 tests PASS
- typecheck PASS
- production build PASS

Functional commit:
- `4651270 Fix scene X-ray interaction and state fallback`

Production deployment:
- `dpl_FrehStjD4MiniMghUdoxdSHaeQA4`
- READY
- `wetapp.madproduction.ai` active.


## 2026-10-08 — Private X-ray enforcement + six present members

User reported that the X-ray panel could open but all three private fields remained unavailable:
- inner thought
- attention
- chemistry

Root cause:
- parser/UI supported private state, but generation acceptance did NOT require it.
- A Group reply could be accepted even if the model omitted those fields, leaving the panel empty.

Fix:
- added `getMissingGroupPrivateStateMembers()` in the Group generation path.
- every currently present member must have non-empty:
  - attention
  - innerThought
  - chemistry
- if any present member is missing any of the three, the Group candidate is rejected before acceptance and enters the existing repair/fallback path.
- retry instructions now include the concrete previous defect, including which member(s) were missing private scene state.
- no new always-on second API call was added; repair occurs only when the main Group generation fails this contract.

Presence capacity:
- `ROOM_PRESENT_MEMBER_LIMIT` raised from 5 to 6.
- This affects the real scene/presence limit across room manager, participant actions, Group schema maxItems, Surprise Event participant slicing, and other consumers of the shared constant.
- User is not counted as one of these six character slots.
- Total fixed room member limit remains 8.

Validation:
- 691/691 tests PASS
- typecheck PASS
- production build PASS

Functional commit:
- `c2679f3 Require Group private state and allow six present members`

Production:
- `dpl_46Hfps1n3zpgKbKWuZLoSqCTdhx4`
- READY
- `wetapp.madproduction.ai` alias active.


## 2026-10-08 — Composer Enter behavior

User requested:
- Enter must insert a newline.
- Keyboard Enter must never send.
- Only pressing the Send button sends the message.

Implemented:
- removed the messageInput keydown handler that intercepted Enter and called dispatchSendMessage().
- no Ctrl+Enter / Shift+Enter / alternate keyboard send shortcut remains on the shared chat composer.
- native textarea Enter behavior now inserts a newline.
- Send button click remains the sole composer send trigger.
- Applies to the shared composer across ordinary chat, Group and Cc.

Validation:
- 692/692 tests PASS
- typecheck PASS
- direct Vite production build PASS

Functional commit:
- `8bf0ed3 Make Enter insert newline in chat composer`

Production:
- `dpl_7ogpQzEntUotesM26Va175RbyRfC`
- READY
- `wetapp.madproduction.ai` active.
