/* eslint max-len: ["error", { "code": 200 }]*/
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const cors = require("cors")({origin: true});
const re = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{1,5})+$/;

export const _sendUsEmail = functions.https.onRequest(
    async (request, response) => {
      cors(request, response, async () => {
        const nameString = String(request.query.name);
        const emailString = String(request.query.email);
        const subjectString = String(request.query.subject);
        const textString = String(request.query.text);
        if (re.test(emailString) && nameString != null
        && subjectString != null && textString != null) {
          const mailRef = admin.firestore().collection("Emails");
          mailRef.add({
            "name": nameString,
            "email": emailString,
            "subject": subjectString,
            "text": textString,
            "time sent": admin.firestore.Timestamp.now(),
            "processed": false,
          }).catch((error) => {
            console.log(error);
            response.status(500).send(error);
          });
        }
        response.status(200).send();
      });
    });
