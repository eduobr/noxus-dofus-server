const Logger = require("../io/logger")
const Messages = require("../io/dofus/messages")
const Types = require("../io/dofus/types")
const IO = require("../io/custom_data_wrapper")
const Formatter = require("../utils/formatter")
const DBManager = require("../database/dbmanager")
const Datacenter = require("../database/datacenter")
const ConfigManager = require("../utils/configmanager")
// Lazy require para romper ciclo: world → world_client → processor → handlers → world
function getWorldServer() { return require("../network/world"); }
const AuthServer = require("../network/auth")
const PlayableBreedEnum = require("../enums/playable_breed_enum")
const Character = require("../database/models/character")
const WorldManager = require("../managers/world_manager")
const CharacterManager = require("../managers/character_manager")
const Loader = require("../managers/loader_manager")
const FriendHandler = require("../handlers/friend_handler")
class EmoteHandler {

    static getAllEmotes()
    {
        var objects = Datacenter.emotes;
        var emotes = [];

        for (var i of objects)
            emotes.push(i._id);
        return emotes;
    }

    static getEmoteById(id)
    {
        var emotes = Datacenter.emotes;
        for(var i in emotes){
            if (emotes[i]._id == id)
                return emotes[i];
        }
        return null;
    }

    static haveEmote(client, id)
    {
        var emotes = client.character.emotes;
        for(var i in emotes) {
            if (emotes[i] == id)
                return true;
        }
        return false;
    }

    static handleEmotePlayRequestMessage(client, packet){
        if (EmoteHandler.haveEmote(client, packet.emoteId))
        {
            var time = Date.now || function () { return +new Date; };
            client.character.getMap().send(new Messages.EmotePlayMessage(packet.emoteId, time(), client.character._id, client.account.uid));
        }
    }
}
module.exports = EmoteHandler