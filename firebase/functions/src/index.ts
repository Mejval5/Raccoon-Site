const admin = require("firebase-admin");
admin.initializeApp();

import {_uploadEmail} from "./lib/UploadEmail";
import {_sendUsEmail} from "./lib/SendUsEmail";

// Start writing Firebase Functions
// https://firebase.google.com/docs/functions/typescript

export const uploadEmail = _uploadEmail;
export const sendUsEmail = _sendUsEmail;
