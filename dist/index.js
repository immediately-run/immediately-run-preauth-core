"use strict";
// @immediately-run/preauth-core — the shared pre-auth core.
//
// ONE §8.9 gate (`planPreAuthCapabilities`), ONE mint path (`mintConsentedGrants`,
// `applyPreAuth`), ONE capability vocabulary (`./capabilities`), ONE wire layout
// (`./docLayout`). site-main (browser Firestore) and the backend (admin Firestore)
// both consume this so a CLI/backend-minted grant is byte-identical to one
// site-main mints, and no surface can mint a capability the in-browser gate would
// have refused.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./capabilities"), exports);
__exportStar(require("./port"), exports);
__exportStar(require("./docLayout"), exports);
__exportStar(require("./bootConsent"), exports);
__exportStar(require("./m1PreAuth"), exports);
