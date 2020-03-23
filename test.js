const syncer = require('./src/syncer');

const testObj = {
  school:{
    id: "testschoolRC001",
    has_allhands_channel : true,
    name: "Peanuts High 001"
  },
  user: {
    id: "@user06:matrix.stomt.com",//numeric is not allowed
    name: "Dr. Specht",
    is_school_admin: true,
    is_teacher: true,
    tags: ["Mathe", "Sport"] // could be used for global room invites
  },
  rooms:[
    {
      id: '0000122222',
      name: 'Kurs 1',
      type: 'course',
      bidirectional: false,
      is_moderator: true
    },
    {
      id: '00011111ww1xxxxyt',
      name: 'Team 777xxxxt',
      type: 'team',
      bidirectional: true,
      is_moderator: true
    },
    {
      id: '000004(bi)',
      name: 'team 4',
      type: 'team',
      bidirectional: false,
      is_moderator: false
    },
  ]
};

const testObj2 = {
  school:{
    id: "testschool003",
    has_allhands_channel : true,
    name: "Peanuts High 003"
  },
  user: {
    id: "@test666:matrix.stomt.com",//numeric is not allowed
    name: "Joe Cool",
    is_school_admin: true,
    is_teacher: true,
    tags: ["Mathe", "Sport"] // could be used for global room invites
  },
  rooms:[
  ]
};

// run for dev testing
syncer.syncUserWithMatrix(testObj);
syncer.syncUserWithMatrix(testObj2);


console.log('DONE');
