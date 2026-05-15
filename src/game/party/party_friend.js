const PartyType = require("../../enums/party_type")
const Party = require("../../game/party/party")
class PartyFriend extends Party {
    constructor(characterLeader)
    {
        super(PartyType.PARTY_TYPE_CLASSICAL, characterLeader);
    }
}

module.exports = PartyFriend