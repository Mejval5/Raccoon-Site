/* eslint max-len: ["error", { "code": 200 }]*/
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {secretKey} from "./SecretKey";

const rp = require("request-promise");

const cors = require("cors")({origin: true});
const re = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{1,10})+$/;

export const _sendUsEmail = functions.https.onRequest(
    async (request, response) => {
      cors(request, response, async () => {
        const nameString = String(request.query.name);
        const emailString = String(request.query.email);
        const subjectString = String(request.query.subject);
        const textString = String(request.query.text);
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
        if (re.test(emailString) && nameString != null &&
        subjectString != null && textString != null && result.score > 0.05) {
          let mailRef = admin.firestore().collection("Emails");
          if (result.score < 0.5) {
            mailRef = admin.firestore().collection("EmailsLowScore");
          }
          mailRef.add({
            "name": nameString,
            "email": emailString,
            "subject": subjectString,
            "text": textString,
            "time sent": admin.firestore.Timestamp.now(),
            "score": result.score,
            "processed": false,
          }).catch((error) => {
            console.log(error);
            response.status(500).send(error);
          });
          admin.firestore().collection("Sent emails").add({
            to: "necesal.daniel@gmail.com",
            message: {
              subject: subjectString,
              html: textString + "<br>From: " + nameString + "<br>Sent by: " + emailString,
            },
          });
        }
        response.status(200).send();
      });
    });
