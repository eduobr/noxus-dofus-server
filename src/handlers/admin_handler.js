const Logger = require("../io/logger")
const Messages = require("../io/dofus/messages")
const Types = require("../io/dofus/types")
const IO = require("../io/custom_data_wrapper")
const Formatter = require("../utils/formatter")
const DBManager = require("../database/dbmanager")
const ConfigManager = require("../utils/configmanager")
// Lazy require para romper ciclo: world → world_client → processor → handlers → world
function getWorldServer() { return require("../network/world"); }
const AuthServer = require("../network/auth")
const PlayableBreedEnum = require("../enums/playable_breed_enum")
const Character = require("../database/models/character")
const WorldManager = require("../managers/world_manager")
const AccountRole = require("../enums/account_role_enum")
const Pathfinding = require("../game/pathfinding/pathfinding")
class AdminHandler {

    static handleAdminQuietCommandMessage(client, packet)
    {
        if (client.account.scope < AccountRole.ANIMATOR)
            return;
        var data = packet.content.split(" ");
        switch (data[0])
        {
            case "moveto":
                WorldManager.teleportClient(client, data[1], client.character.cellid, function(result) {
                    if (!result) {
                        client.character.replyError("Impossible de vous téléporter sur cette carte !");
                        return;
                    }
                    var cells = client.character.getMap().cells;

                    if (!cells[client.character.cellid]._mov) {
                        var newCell = Pathfinding.findClosestWalkableCell(client);

                        if (newCell != 0 && cells[newCell]._mov) {
                            WorldManager.teleportClient(client, client.character.getMap()._id, newCell, function(){
                            });
                        }
                    }
            });
            break;
        }
    }

}
module.exports = AdminHandler