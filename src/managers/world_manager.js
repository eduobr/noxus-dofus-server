const Logger = require("../io/logger")
// Lazy requires para romper ciclos con DBManager y WorldServer
function getDBManager() { return require("../database/dbmanager"); }
function getWorldServer() { return require("../network/world"); }
const Map = require("../database/models/map")
//require("babel-polyfill");

class WorldManager {

    static maps = [];

    static teleportClient(client, mapId, cellId, callback) {
		mapId = parseInt(mapId);
		cellId = parseInt(cellId);
		
        WorldManager.getMap(mapId, function(map) {
			if(map == null) {
				if (callback) callback(false);
			}
			else {
				if(!client.character.firstContext) client.character.getMap().removeClient(client);
				client.character.cellid = cellId;
				client.character.mapid = mapId;
				map.addClient(client);
                if (client.character.party)
                    client.character.party.sendPositionToFollowers(client.character);
				if (callback) callback(true);

			}
		});
    }

    static getMap(mapId, callback) {
        for(var i in WorldManager.maps) {
            if(WorldManager.maps[i]._id == mapId) {
                callback(WorldManager.maps[i]);
				return;
            }
        }
		getDBManager().getMaps({_id: mapId}, function(maps) {
			if(maps.length > 0) {
				var map = new Map(maps[0]);
				WorldManager.maps.push(map);
				map.init();
				callback(map);
			}
			else {
				callback(null);
			}
		});
    }

	static getMapInstantly(mapId)
	{
		for(var i in WorldManager.maps) {
            if(WorldManager.maps[i]._id == mapId) {
				return WorldManager.maps[i];
            }
        }
		return null;
	}
	
	static loadSubArea(subAreaId, callback) {
		
	}

	//static async saveWorld() {
    static saveWorld() {
        getWorldServer().sendTextInformationMessageToAll(1, 164, []);
        var clients = getWorldServer().getAllOnlineClients();
        for (var client of clients) {
        	//await client.character.save();
            client.character.save();
		}
        getWorldServer().sendTextInformationMessageToAll(1, 165, []);
	}
}
module.exports = WorldManager