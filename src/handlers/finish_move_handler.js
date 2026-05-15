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
class FinishMoveHandler {

    static handleFinishMoveListRequestMessage(client, packet) {
        //TODO
        var moves = [];
        moves.push(new Types.FinishMoveInformations(1, true));
        client.send(new Messages.FinishMoveListMessage(moves));
    }

}
module.exports = FinishMoveHandler