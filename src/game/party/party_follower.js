const PartyType = require("../../enums/party_type")
const Party = require("../../game/party/party")
class PartyFollower {
    follower = null;
    followed = null;
    constructor(follower, followed)
    {
        this.follower = follower;
        this.followed = followed;
    }
}

module.exports = PartyFollower