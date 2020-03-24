const syncer = require('./src/syncer');
const listener = require('./src/listener');

const schoolCloudSeed = [
  {
    "method": "adduser",
    "school": {"id": "0000d186816abba584714c5f", "has_allhands_channel": true, "name": "Paul-Gerhardt-Gymnasium "},
    "user": {"id": "@sso_0000d213816abba584714c0a:matrix.stomt.com", "name": "Thorsten Test", "email": "admin@schul-cloud.org", "is_school_admin": true, "is_school_teacher": false},
    "rooms": [{"id": "0000dcfbfb5c7a3f00bf21ab", "name": "Mathe", "type": "course", "bidirectional": false, "is_moderator": false}]
  },

  {
    "method": "adduser",
    "school": {"id": "0000d186816abba584714c5f", "has_allhands_channel": true, "name": "Paul-Gerhardt-Gymnasium "},
    "user": {
      "id": "@sso_58b40278dac20e0645353e3a:matrix.stomt.com",
      "name": "Waldemar Wunderlich",
      "email": "waldemar.wunderlich@schul-cloud.org",
      "is_school_admin": false,
      "is_school_teacher": false
    },
    "rooms": [{"id": "5e1dc275322ce040a850b14b", "name": "A-Team", "type": "team", "bidirectional": false, "is_moderator": false}]
  },

  {
    "method": "adduser",
    "school": {"id": "0000d186816abba584714c5f", "has_allhands_channel": true, "name": "Paul-Gerhardt-Gymnasium "},
    "user": {"id": "@sso_0000d224816abba584714c9c:matrix.stomt.com", "name": "Marla Mathe", "email": "schueler@schul-cloud.org", "is_school_admin": false, "is_school_teacher": false},
    "rooms": [
      {"id": "0000dcfbfb5c7a3f00bf21ab", "name": "Mathe", "type": "course", "bidirectional": false, "is_moderator": false},
      {"id": "5e1dba1eaa30ab4df47e11d2", "name": "Test Team", "type": "team", "bidirectional": false, "is_moderator": false},
      {"id": "5e1dc275322ce040a850b14b", "name": "A-Team", "type": "team", "bidirectional": false, "is_moderator": true}
    ]
  },

  {
    "method": "adduser",
    "school": {"id": "0000d186816abba584714c5f", "has_allhands_channel": true, "name": "Paul-Gerhardt-Gymnasium "},
    "user": {"id": "@sso_0000d213816abba584714c0b:matrix.stomt.com", "name": "Janno Jura", "email": "janno.jura@schul-cloud.org", "is_school_admin": true, "is_school_teacher": false},
    "rooms": [{"id": "5e1dba1eaa30ab4df47e11d2", "name": "Test Team", "type": "team", "bidirectional": false, "is_moderator": true}]
  },

  {
    "method": "adduser",
    "school": {"id": "0000d186816abba584714c5f", "has_allhands_channel": true, "name": "Paul-Gerhardt-Gymnasium "},
    "user": {"id": "@sso_0000d231816abba584714c9e:matrix.stomt.com", "name": "Cord Carl", "email": "lehrer@schul-cloud.org", "is_school_admin": false, "is_school_teacher": true},
    "rooms": [
      {"id": "0000dcfbfb5c7a3f00bf21ab", "name": "Mathe", "type": "course", "bidirectional": false, "is_moderator": true},
      {"id": "5e1dba1eaa30ab4df47e11d2", "name": "Test Team", "type": "team", "bidirectional": false, "is_moderator": true},
      {"id": "5e1dc275322ce040a850b14b", "name": "A-Team", "type": "team", "bidirectional": false, "is_moderator": true}
    ]
  },

  {
    "method": "adduser",
    "school": {"id": "0000d186816abba584714c5f", "has_allhands_channel": true, "name": "Paul-Gerhardt-Gymnasium "},
    "user": {"id": "@sso_0000d231816abba584714c9c:matrix.stomt.com", "name": "Super Hero", "email": "superhero@schul-cloud.org", "is_school_admin": false, "is_school_teacher": false},
    "rooms": []
  },
];

// run for dev testing
async function executeTests() {
  // direct
  for (let msg of schoolCloudSeed) {
    await syncer.syncUserWithMatrix(msg);
  }

  // via listener
  for (let msg of schoolCloudSeed) {
    await listener.onMessage({content: JSON.stringify(msg)});
  }
}

async function executeRandomizedTests(amount_users = 10, amount_rooms = 5) {
  const school = {
    "id": randomString(20),
    "has_allhands_channel": true,
    "name": "Random School",
  };

  let users = [];
  for (let i = 0; i < amount_users; i++) {
    users.push({
      "id": `@test_${randomString(10)}:matrix.stomt.com`,
      "name": "Random Test User",
      "email": `${randomString(10)}@test.com`,
      "is_school_admin": false,
      "is_school_teacher": false,
    });
  }

  let rooms = [];
  for (let i = 0; i < amount_rooms; i++) {
    rooms.push({
      "id": `${randomString(10)}`,
      "name": "Random Room",
      "type": "course",
      "bidirectional": false,
      "is_moderator": false,
    });
  }

  for (let user of users) {

    let msg = {
      school: school,
      user: user,
      rooms: [],
    };
    const amount_rooms_for_user = Math.random() * 5;

    while (msg.rooms.length < amount_rooms_for_user) {
      const roomIndex = Math.floor(Math.random() * rooms.length);
      let room = rooms[roomIndex];
      room.is_moderator = user.is_school_teacher;
      msg.rooms.push(room);
      // TODO: don't add same room twice
    }

    await syncer.syncUserWithMatrix(msg);
  }
}

function randomString(length) {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;

  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
}


executeRandomizedTests(3, 5)
  .then(() => {
    console.log('DONE');
  });
