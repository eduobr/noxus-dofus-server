// Lazy require para romper dependencia circular con DBManager
function getDB() { return require("./dbmanager"); }
const Logger = require("../io/logger")
const LookManager = require("../managers/look_manager")
const NpcSpawn = require("../database/models/npc_spawn")
class Datacenter {

    static breeds;
    static heads;
    static mapScrollsActions;
    static experiences;
    static smileys;
    static interactivesObjects;
    static emotes;
    static items;
    static itemsSets;
    static maps_positions;
    static spells;
    static spellsLevels;
    static elements;
    static npcs = { npcs: [], npcSpawns: [] , npcReplies :[] , npcActions :[] , npcItems : [] };
    static monsters;

    static load(callback) {
        var loaders = [
            Datacenter.loadBreeds,
            Datacenter.loadHeads,
            Datacenter.loadMapScrollsActions,
            Datacenter.loadExperiences,
            Datacenter.loadSmileys,
            Datacenter.loadInteractivesObjects,
            Datacenter.loadEmotes,
            Datacenter.loadItems,
            Datacenter.loadMapsPositions,
            Datacenter.loadSpells,
            Datacenter.loadSpellsLevels,
            Datacenter.loadElements,
            Datacenter.loadNpcs,
            Datacenter.loadNpcItems,
            Datacenter.loadNpcActions,
            Datacenter.loadItemsSets,
            Datacenter.loadNpcsReplies,
            Datacenter.loadMonsters

        ];
        var loaded = 0;

        for (var i in loaders) {
            loaders[i](function () {
                loaded++;
                if (loaded == loaders.length) {
                    callback();
                }
            });
        }
    }

    static loadBreeds(callback) {
        getDB().getBreeds(function (breeds) {
            Datacenter.breeds = breeds;
            Logger.infos("Loaded '" + breeds.length + "' breed(s)");
            callback();
        });
    }

    static loadHeads(callback) {
        getDB().getHeads(function (heads) {
            Datacenter.heads = heads;
            Logger.infos("Loaded '" + heads.length + "' heads(s)");
            callback();
        });
    }

    static loadMapScrollsActions(callback) {
        getDB().getMapScrollActions(function (scrolls) {
            Datacenter.mapScrollsActions = scrolls;
            Logger.infos("Loaded '" + scrolls.length + "' map scroll actions(s)");
            callback();
        });
    }

    static loadExperiences(callback) {
        getDB().getExperiences(function (experiences) {
            Datacenter.experiences = experiences;
            Logger.infos("Loaded '" + experiences.length + "' experience floor(s)");
            callback();
        });
    }

    static loadSmileys(callback) {
        getDB().getSmileys(function (smileys) {
            Datacenter.smileys = smileys;
            Logger.infos("Loaded '" + smileys.length + "' smiley(s)");
            callback();
        });
    }

    static loadNpcs(callback) {
        getDB().getNpcs(function (npcs) {
            Datacenter.npcs.npcs = npcs;
            Logger.infos("Loaded '" + Datacenter.npcs.npcs.length + "' npcs");

            getDB().getNpcSpawns(function (npcSpawns) {
                for (var i in npcSpawns) {
                    var npc = Datacenter.getNpcs(npcSpawns[i].npcId);
                    
                    Datacenter.npcs.npcSpawns.push(new NpcSpawn(npcSpawns[i], LookManager.parseLook(npc.look),Datacenter.getNpcAction(npcSpawns[i].npcId)));                 
                }

                Logger.infos("Loaded '" + Datacenter.npcs.npcSpawns.length + "' npc_spawns");
                callback();
            });


        });
    }

    static loadNpcsReplies(callback){
        getDB().getNpcReplies(function(npcReplies) {
                Datacenter.npcs.npcReplies = npcReplies;
                Logger.infos("Loaded '" + Datacenter.npcs.npcReplies.length + "' npcs_replies");
                callback();  
        });
    }

    static loadNpcItems(callback){
        getDB().getNpcItems(function(npcItems) {
                Datacenter.npcs.npcItems = npcItems;
                Logger.infos("Loaded '" + Datacenter.npcs.npcItems.length + "' npcs_items");
                callback();  
        });
    }

    static loadNpcActions(callback) {
        getDB().getNpcActions(function (npcAction) {
            Datacenter.npcs.npcActions = npcAction;
            Logger.infos("Loaded '" + npcAction.length + "' npc_actions");
            callback();
        });
    }
    static loadInteractivesObjects(callback) {
        getDB().getInteractivesObjects(function (interactivesObjects) {
            Datacenter.interactivesObjects = interactivesObjects;
            Logger.infos("Loaded '" + interactivesObjects.length + "' interactives object(s)");
            callback();
        });
    }

    static loadMapsPositions(callback) {
        getDB().getMapPositions(function (maps_positions) {
            Datacenter.maps_positions = maps_positions;
            Logger.infos("Loaded '" + maps_positions.length + "' maps_positions object(s)");
            callback();
        });
    }

    static loadElements(callback) {
        getDB().getElements(function (elements) {
            Datacenter.elements = elements;
            Logger.infos("Loaded '" + elements.length + "' elements object(s)");
            callback();
        });
    }

    static loadEmotes(callback) {
        getDB().getEmotes(function (emotes) {
            Datacenter.emotes = emotes;
            Logger.infos("Loaded '" + emotes.length + "' emote(s)");
            callback();
        });
    }

    static loadItems(callback) {
        getDB().getItems(function (items) {
            Datacenter.items = items;
            Logger.infos("Loaded '" + items.length + "' item(s)");
            callback();
        });
    }

    static loadItemsSets(callback) {
        getDB().getItemsSets(function (itemsSets) {
            Datacenter.itemsSets = itemsSets;
            Logger.infos("Loaded '" + itemsSets.length + "' items sets");
            callback();
        });
    }

    static loadSpells(callback) {
        getDB().getSpells(function (spells) {
            Datacenter.spells = spells;
            Logger.infos("Loaded '" + spells.length + "' spell(s)");
            callback();
        });
    }

    static loadSpellsLevels(callback) {
        getDB().getSpellsLevels(function (spells) {
            Datacenter.spellsLevels = spells;
            Logger.infos("Loaded '" + spells.length + "' spell level(s)");
            callback();
        });
    }

    static loadMonsters(callback) {
        getDB().getMonsters(function (monsters) {
            Datacenter.monsters = monsters;
            Logger.infos("Loaded '" + monsters.length + "' monster(s)");
            callback();
        });
    }

    static getMapScrollActionById(id) {
        for (var i in Datacenter.mapScrollsActions) {
            if (Datacenter.mapScrollsActions[i].id == id)
                return Datacenter.mapScrollsActions[i];
        }
        return null;
    }

    static getMapElement(map, element) {
        for (var i in Datacenter.elements) {
            if (Datacenter.elements[i].Map_id == map && Datacenter.elements[i].Element_id == element)
                return Datacenter.elements[i];
        }
        return null;
    }

    static getInteractivesMap(id) {
        var result = new Array();
        for (var i in Datacenter.interactivesObjects) {

            if (Datacenter.interactivesObjects[i].mapId == id)
                result.push(Datacenter.interactivesObjects[i]);
        }
        if (result.length > 0)
            return result;
        else
            return [];
    }

    static getLookNpcs(id) {
        for (var i in Datacenter.npcs.npcs) {
            if (Datacenter.npcs.npcs[i]._id == id) {
                return Datacenter.npcs.look[i];
            }
        }
        return null;
    }
    static getNpcs(id) {
        for (var i in Datacenter.npcs.npcs) {
            if (Datacenter.npcs.npcs[i]._id == id) {
                return Datacenter.npcs.npcs[i];
            }
        }
        return null;
    }

    static getNpcsMap(id) {
        var result = [];
        for (var i in Datacenter.npcs.npcSpawns) {
            if (Datacenter.npcs.npcSpawns[i].mapId == id) {
                result.push(Datacenter.npcs.npcSpawns[i]);
            }
        }
        return result;
    }

    static getNpcReplies(id){
        var result = [];
        for(var i in this.npcs.npcReplies){
            if(this.npcs.npcReplies[i].messageId == id){
                result.push(this.npcs.npcReplies[i]);
            }
        }

        return result;       
    }



    static getNpcAction(id){
        var result = [];
        for(var i in Datacenter.npcs.npcActions){
            if(this.npcs.npcActions[i].npcId == id){
                result.push(this.npcs.npcActions[i]);
            }
        }

        return result;       
    }

    static getNpcItems(id){
        var result = [];
        for(var i in Datacenter.npcs.npcItems){
            if(this.npcs.npcItems[i].npcId == id){
                result.push(this.npcs.npcItems[i]);
            }
        }

        return result;  
    }

}
module.exports = Datacenter