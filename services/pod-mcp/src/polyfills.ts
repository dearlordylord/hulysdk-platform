//
// Copyright © 2026 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

// The @hcengineering client libraries detect a browser via `typeof localStorage` /
// `typeof sessionStorage`, assuming those globals exist only in browsers. Node >= 24
// exposes them as globals (stabilized WebStorage), which defeats that guard and makes
// the platform run browser-only paths (indexedDB.open, window.addEventListener) that
// throw on the server. Remove them so runtime detection resolves to Node/server.
//
// WebSocket (also a recent Node global) is intentionally left intact — the transactor
// connection needs it.
//
// This MUST run before any @hcengineering/* module is evaluated, so it is imported as
// the first statement of index.ts (ES module imports are hoisted, so a side-effect
// import is the only reliable way to win that ordering).

Reflect.deleteProperty(globalThis, "localStorage")
Reflect.deleteProperty(globalThis, "sessionStorage")
