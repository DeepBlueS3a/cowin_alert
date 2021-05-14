const request_promise = require("request-promise");
const express = require("express");
const math = require("math");
const vaccines = require("./vaccines");
const admin = require("firebase-admin");

var serviceAccount = require("./creds/serviceAccount.json");
const track_changes = require("./track_changes");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
const INTERVAL_TO_CHECK = 900000; // milliseconds -> 15 minutes


const app = express();
app.use(express.json());
const port = 3000;

app.get('/check_vaccine', (req, res) => {
    let state = req.body.state;
    let district = req.body.district;
    let age = req.body.age; // Can be 18 or 45 only
    let html = vaccines.get_vaccine_data(age, state, district, (vaccines_dates, vaccines_centres) => {
        res.json({
            dates: vaccines_dates,
            centres: vaccines_centres
        });
    });
});

app.post('/add_user', (req, res) => {
    let state = req.body.state;
    let district = req.body.district;
    let age = parseInt(req.body.age);
    if (age >= 18 && age < 45) {
        age = 18;
    } else if (age >= 45) {
        age = 45;
    }

    let email = req.body.email;
    let phoneNumber = req.body.phoneNumber;
    db.collection("users").add({
        state: state,
        district: district,
        age: age,
        email: email,
        phoneNumber: phoneNumber
    }).then(async () => {
        let districtsRef = db.collection("districts");
        let query = districtsRef
            .where("state", "==", state)
            .where("district", "==", district)
            .where("age", "==", age);
        query.get()
        .then(async (snapShot) => {
            let found = false;
            (await snapShot).forEach((doc) => {
                if (doc.data().district == district) {
                    found = true;
                    console.log('found');
                }
            });
            if (!found) {
                db.collection("districts").add({
                    age: age,
                    state: state,
                    district: district,
                    dates: null,
                    centres: null
                });
                track_changes.track_changes(age, state, district, db);
            }
        })
        .catch((error) => {
            console.error(error);
        });
    });

    res.send("added user To the database");
});

function repeat_run(func_to_run) {
    func_to_run();
    setTimeout(() => {
        func_to_run();
        repeat_run(func_to_run);
    }, INTERVAL_TO_CHECK);
}

app.listen(port, ()=>{
    console.log(`Listening on http://localhost:${port}`);
    repeat_run(() => {
        db.collection("districts").get().then(async (docs) => {
            docs.forEach(async (district) => {
                let district_data = district.data(); // Assuming that there's a change
                let changes = await track_changes.track_changes(district_data.age, 
                    district_data.state, 
                    district_data.district, 
                    district);
                
                console.log(`got changes ${changes}`);

                let there_is_change = changes[0];
                let type = changes[1];
                console.log(there_is_change);
                console.log(type);

                if (there_is_change) {
                    let users = db.collection("users").get().then(async (docs) => {
                        docs.forEach((user) => {
                            let user_data = user.data();
                            if (user_data.age == distrit_data.age && 
                                user_data.state == distrit_data.state && 
                                user_data.district == distrit_data.district) {
                                    if (user_data.email == "@") {
                                        let email = false;
                                    } else {
                                        let email = true;
                                    }
                                    send_message.send_message(
                                        user_data.phoneNumber, 
                                        email, 
                                        user_data.district, 
                                        type);
                                }
                        })
                    });
                }
            });
        });
    });
});
