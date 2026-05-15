const Logger = require("../../io/logger")
// Lazy requires para romper ciclos con world.js y datacenter
function getDatacenter() { return require("../../database/datacenter"); }
function getWorldServer() { return require("../../network/world"); }
function getInteractiveHandler() { return require("../../handlers/interactive_handler"); }
function getFight() { return require("../../game/fight/fight"); }
function getMonstersGroup() { return require("../../game/monsters/monsters_group"); }
function getMonstersManager() { return require("../../game/monsters/monsters_manager"); }
function getSpawnManager() { return require("../../managers/spawn_manager"); }
const Messages = require("../../io/dofus/messages")
const Types = require("../../io/dofus/types")
const DataMapProvider = require("../../game/pathfinding/data_map_provider")
const ConfigManager = require("../../utils/configmanager")
var zlib = require('zlib');

class Map {

    static MAP_DECRYPT_KEY = "649ae451ca33ec53bbcbcc33becf15f4";

    clients =  [];
    npcs = {npcs : [] , packet : []};

    constructor(raw) {
        this._id = raw._id;
        this.subareaId = raw.subareaId;
        this.topNeighbourId = raw.topNeighbourId;
        this.bottomNeighbourId = raw.bottomNeighbourId;
        this.leftNeighbourId = raw.leftNeighbourId;
        this.rightNeighbourId = raw.rightNeighbourId;
        this.cellsRaw = raw.cells;
        this.dataMapProvider = new DataMapProvider(this);
        this.fights = [];
        this.monsters = [];
        this.monstersGroups = [];
        this.mapType = raw.mapType;
        this.tempId = 100000;
    }

    init() {
        this.cells = JSON.parse(zlib.inflateSync(new Buffer(this.cellsRaw, 'base64')).toString());
        this.zaap = this.getZaap();
        var result = getDatacenter().getNpcsMap(this._id);
        for (var i in result) {
            this.npcs.npcs.push(result[i]);
            this.npcs.packet.push(new Messages.GameRolePlayShowActorMessage(new Types.GameRolePlayNpcInformations(-result[i]._id, result[i].realLook.toEntityLook(), new Types.EntityDispositionInformations(result[i].cellId, result[i].direction), result[i].npcId, false, 0)));
        }
        //this.refillMapWithMonstersGroups();
        getSpawnManager().getMonstersAndGenerateGroups(this);
        getWorldServer().instanciedMaps.push(this);
    }

    getAvailableCells() {
        if(this.availableCells) {
            return this.availableCells;
        }
        var aCells = [];
        for (var cell of this.cells) {
            if (cell._mov) {
                aCells.push(cell);
            }
        }
        this.availableCells = aCells;
        return aCells;
    }

    isWalkableCell(cellId) {
        var cells = this.getAvailableCells();
        var result = false;
        for(var c of cells) {
            if(c.id == cellId && c._mov) {
                result = true;
                break;
            }
        }
        return result;
    }

    addClient(client) {
        if (this.clientExist(client.character._id) == false) {
            Logger.debug("Add new player in the mapId: " + this._id);
            this.send(new Messages.GameRolePlayShowActorMessage(client.character.getGameRolePlayCharacterInformations(client.account)));
            this.clients.push(client);
            client.send(new Messages.CurrentMapMessage(this._id, Map.MAP_DECRYPT_KEY));
            getInteractiveHandler().checkIfCharacterHaveZaap(client, this);
        } else {
            client.character.dispose();
        }
    }

    removeClient(client) {
        var index = this.clients.indexOf(client);
        if (index != -1) {
            this.clients.splice(index, 1);
            this.send(new Messages.GameContextRemoveElementMessage(client.character._id));
        }
    }

    getMapActors() {
        var actors = [];
        for (var i in this.clients) {
            actors.push(this.clients[i].character.getGameRolePlayCharacterInformations(this.clients[i].account));
        }
       
        for (var i in this.npcs.packet) {
            this.send(this.npcs.packet[i]);
        }

        for(var group of this.monstersGroups) {
            actors.push(group.getGameRolePlayGroupMonsterInformations());
        }
        return actors;
    }

    getClientByCharacterId(characterId) {
        for (var client of this.clients) {
            if (client.character) {
                if (client.character._id == characterId) return client;
            }
        }
        return null;
    }

    getFightById(fightId) {
        for (var fight of this.fights) {
            if (fight.id == fightId) return fight;
        }
        return null;
    }

    sendComplementaryInformations(client) {
        var Interactives = getDatacenter().getInteractivesMap(this._id);
        var result = new Array();
        if (Interactives != null) {
            for (var i in Interactives) {
                result.push(new Types.InteractiveElement(Interactives[i].elementId, Interactives[i].elementTypeId, [new Types.InteractiveElementSkill(Interactives[i].skillId, 1)], [], true));
            }
        }
        client.send(new Messages.MapComplementaryInformationsDataMessage(this.subareaId, this._id, [], this.getMapActors(), result, [], [], [], false));

        for(var fight of this.fights) {
            if(fight.fightState == getFight().FIGHT_STATES.STARTING) {
                client.send(new Messages.GameRolePlayShowChallengeMessage(fight.getFightCommonInformations()));
            }
        }
    }

    send(packet) {
        for (var i in this.clients) {
            this.clients[i].send(packet);
        }
    }

    getZaap() {
        for (var i in getDatacenter().interactivesObjects) {

            if (getDatacenter().interactivesObjects[i].mapId == this._id && getDatacenter().interactivesObjects[i].actionType == "Zaap")
                return getDatacenter().interactivesObjects[i];
        }
        return null;
    }

    getZaapi() {
        for (var i in getDatacenter().interactivesObjects) {

            if (getDatacenter().interactivesObjects[i].mapId == this._id && getDatacenter().interactivesObjects[i].actionType == "Zaapi")
                return getDatacenter().interactivesObjects[i];
        }
        return null;
    }

    sendExcept(packet, client) {
        for (var i in this.clients) {
            if (client.character._id == this.clients[i].character._id) continue;
            this.clients[i].send(packet);
        }
    }

    getMapPosition() {
        var mapsPositions = getDatacenter().maps_positions;
        for (var i in mapsPositions) {
            if (mapsPositions[i]._id == this._id)
                return mapsPositions[i];
        }
        return null;
    }

    getNpcMap(id){

        for(var i in this.npcs.npcs){
            if(this.npcs.npcs[i]._id == -id){
                return this.npcs.npcs[i];
            }
        }

        return null;
    }

    clientExist(id) {
        for (var i in this.clients) {
            if (this.clients[i]._id == id)
                return true;
        }
        return false;
    }

    getMonsterGroup(groupId) {
        for(var g of this.monstersGroups) {
            if(g.id == groupId) return g;
        }
        return null;
    }

    removeMonsterGroup(group) {
        group.removeFromMap();
        var index = this.monstersGroups.indexOf(group);
        if (index != -1) {
            this.monstersGroups.splice(index, 1);
        }
        var group = getSpawnManager().generateGroup(this, true);
        this.monstersGroups.push(group);
        this.send(new Messages.GameRolePlayShowActorMessage(group.getGameRolePlayGroupMonsterInformations()));
    }

    getNextMonsterGroupsId()
    {
        return this.tempId--;
    }
}
module.exports = Map