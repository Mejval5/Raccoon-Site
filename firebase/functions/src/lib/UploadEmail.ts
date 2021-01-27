/* eslint max-len: ["error", { "code": 200 }]*/
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const cors = require("cors")({origin: true});
const re = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{1,5})+$/;

export const _uploadEmail = functions.https.onRequest(
    async (request, response) => {
      cors(request, response, async () => {
        const emailString = String(request.query.text);
        if (re.test(emailString)) {
          const docMailRef = admin.firestore().collection("NewsletterEmails").doc(emailString);
          const doc = await docMailRef.get();
          let processed = false;
          if (doc.exists) {
            processed = doc.data().processed;
          }
          docMailRef.set({
            "mail": emailString,
            "lastUpdated": admin.firestore.Timestamp.now(),
            "processed": processed,
          }).catch((error) => {
            console.log(error);
            response.status(500).send(error);
          });
        }
        response.status(200).send();
      });
    });
