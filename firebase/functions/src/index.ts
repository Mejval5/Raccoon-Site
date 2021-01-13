const admin = require("firebase-admin");
admin.initializeApp();

import {_uploadMail} from "./lib/UploadMail";

// Start writing Firebase Functions
// https://firebase.google.com/docs/functions/typescript

export const uploadMail = _uploadMail;
