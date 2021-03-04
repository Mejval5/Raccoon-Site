/* eslint max-len: ["error", { "code": 200 }]*/
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {secretKey} from "./SecretKey";

const rp = require("request-promise");
const cors = require("cors")({origin: true});
const re = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{1,5})+$/;

export const _uploadEmail = functions.https.onRequest(
    async (request, response) => {
      cors(request, response, async () => {
        const emailString = String(request.query.text);
        const tokenString = String(request.query.token);
        const result = await rp({
          uri: "https://recaptcha.google.com/recaptcha/api/siteverify",
          method: "POST",
          formData: {
            secret: secretKey,
            response: tokenString,
          },
          json: true,
        });
        if (re.test(emailString) && result.score > 0.05) {
          let docMailRef = admin.firestore().collection("NewsletterEmails").doc(emailString);
          if (result.score < 0.5) {
            docMailRef = admin.firestore().collection("NewsletterEmailsLowScore").doc(emailString);
          }
          const doc = await docMailRef.get();
          let processed = false;
          if (doc.exists) {
            processed = doc.data().processed;
          }
          docMailRef.set({
            "mail": emailString,
            "lastUpdated": admin.firestore.Timestamp.now(),
            "processed": processed,
            "score": result.score,
          }).catch((error) => {
            console.log(error);
            response.status(500).send(error);
          });
        }
        response.status(200).send();
      });
    });
