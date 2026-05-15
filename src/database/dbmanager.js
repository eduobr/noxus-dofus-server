const Logger = require("../io/logger")
const Account = require("./models/account")
const AccountFriend = require("./models/account_friend")
const AccountIgnored = require("./models/account_ignored")
const Character = require("./models/character")
const ConfigManager = require("../utils/configmanager")
const { MongoClient } = require('mongodb')
// Lazy require para romper ciclo: DBManager ↔ EmoteHandler
function getEmoteHandler() { return require("../handlers/emote_handler"); }

class DBManager {

    static db;
    static client;

    // Conexión: callback externo, Promises interno
    static start(callback) {
        const url = 'mongodb://' + ConfigManager.configData.mongodb.host + ':' +
                    ConfigManager.configData.mongodb.port;
        MongoClient.connect(url).then(client => {
            DBManager.client = client;
            DBManager.db = client.db(ConfigManager.configData.mongodb.database);
            Logger.infos("Connected to MongoDB");
            callback();
        }).catch(err => {
            Logger.error("An error occured while trying to connect to the database: " + err);
        });
    }

    // Reemplazo de mongodb-autoincrement
    static async getNextSequence(name) {
        const result = await DBManager.db.collection('counters').findOneAndUpdate(
            { _id: name },
            { $inc: { seq: 1 } },
            { upsert: true, returnDocument: 'after' }
        );
        return result ? result.seq : 1;
    }

    // --- Cuentas ---

    static findAccount(accountName, callback) {
        DBManager.db.collection('accounts').find({ username: accountName }).toArray()
            .then(docs => callback(docs.length > 0 ? new Account(docs[0]) : null))
            .catch(() => callback(null));
    }

    static getAccount(query, callback) {
        DBManager.db.collection('accounts').findOne(query)
            .then(account => callback(account ? new Account(account) : null))
            .catch(() => callback(null));
    }

    static getAccounts(query, callback) {
        DBManager.db.collection('accounts').find(query).toArray()
            .then(accounts => callback(accounts.map(a => {
                // Bug original: account[i] vs accounts[i] — corregido
                return a;
            })))
            .catch(() => callback([]));
    }

    static updateAccount(uid, query, callback) {
        DBManager.db.collection('accounts').updateOne({ uid: uid }, { $set: query })
            .then(() => callback())
            .catch(() => callback());
    }

    static getAccountByCharacterName(name, callback) {
        DBManager.getCharacter({ name: name }, function (character) {
            if (character) {
                DBManager.getAccount({ uid: character.accountId }, function (account) {
                    callback(account || null);
                });
            } else {
                callback(null);
            }
        });
    }

    // --- Personajes ---

    static createCharacter(character, callback) {
        DBManager.getNextSequence("characters").then(autoIndex => {
            DBManager.db.collection("characters").insertOne({
                _id: autoIndex,
                accountId: parseInt(character.accountId),
                name: character.name,
                breed: character.breed,
                sex: character.sex,
                colors: character.colors,
                cosmeticId: parseInt(character.cosmeticId),
                scale: parseInt(character.scale),
                level: parseInt(character.level),
                experience: parseInt(character.experience),
                mapid: parseInt(character.mapid),
                cellid: parseInt(character.cellid),
                dirId: parseInt(character.dirId),
                life: character.life,
                bagId: character.bagId,
                statsPoints: character.statsPoints,
                spellPoints: character.spellPoints,
                zaapKnows: character.zaapKnows,
                zaapSave: character.zaapSave,
                spells: character.spells,
                shortcuts: character.shortcuts,
                stats: {
                    strength: character.statsManager.getStatById(10).base,
                    vitality: character.statsManager.getStatById(11).base,
                    wisdom: character.statsManager.getStatById(12).base,
                    chance: character.statsManager.getStatById(13).base,
                    agility: character.statsManager.getStatById(14).base,
                    intelligence: character.statsManager.getStatById(15).base,
                },
                emotes: getEmoteHandler().getAllEmotes(),
            }).then(() => {
                character._id = autoIndex;
                callback(character);
            });
        });
    }

    static deleteCharacter(query, callback) {
        DBManager.db.collection('characters').deleteOne(query)
            .then(() => callback(true))
            .catch(() => callback(false));
    }

    static getCharacter(query, callback) {
        DBManager.db.collection('characters').findOne(query)
            .then(character => callback(character ? new Character(character, false) : null))
            .catch(() => callback(null));
    }

    static getCharacters(query, callback) {
        DBManager.db.collection('characters').find(query).toArray()
            .then(characters => callback(characters.map(c => new Character(c, false))))
            .catch(() => callback([]));
    }

    static updateCharacter(_id, query, callback) {
        DBManager.db.collection('characters').updateOne({ _id: _id }, { $set: query })
            .then(() => callback())
            .catch(() => callback());
    }

    static updateCharacterbyName(name, query, callback) {
        DBManager.db.collection('characters').updateOne({ name: name }, { $set: query })
            .then(() => callback())
            .catch(() => callback());
    }

    // --- Amigos ---

    static createFriend(friend, callback) {
        DBManager.getNextSequence("accounts_friends").then(autoIndex => {
            DBManager.db.collection("accounts_friends").insertOne({
                _id: autoIndex,
                accountId: parseInt(friend.accountId),
                friendAccountId: parseInt(friend.friendAccountId),
            }).then(() => {
                friend._id = autoIndex;
                callback(friend);
            });
        });
    }

    static getFriends(query, callback) {
        DBManager.db.collection('accounts_friends').find(query).toArray()
            .then(friends => callback(friends.map(f => new AccountFriend(f))))
            .catch(() => callback([]));
    }

    static removeFriend(query, callback) {
        DBManager.db.collection('accounts_friends').deleteOne(query)
            .then(() => callback(true))
            .catch(() => callback(false));
    }

    // --- Ignorados ---

    static createIgnored(ignored, callback) {
        DBManager.getNextSequence("accounts_ignoreds").then(autoIndex => {
            DBManager.db.collection("accounts_ignoreds").insertOne({
                _id: autoIndex,
                accountId: parseInt(ignored.accountId),
                ignoredAccountId: parseInt(ignored.ignoredAccountId),
            }).then(() => {
                ignored._id = autoIndex;
                callback(ignored);
            });
        });
    }

    static getIgnoreds(query, callback) {
        DBManager.db.collection('accounts_ignoreds').find(query).toArray()
            .then(ignoreds => callback(ignoreds.map(i => new AccountIgnored(i))))
            .catch(() => callback([]));
    }

    static removeIgnored(query, callback) {
        DBManager.db.collection('accounts_ignoreds').deleteOne(query)
            .then(() => callback(true))
            .catch(() => callback(false));
    }

    // --- Datos de juego ---

    static getBreeds(callback) {
        DBManager.db.collection('breeds').find({}).toArray().then(r => callback(r));
    }
    static getHeads(callback) {
        DBManager.db.collection('heads').find({}).toArray().then(r => callback(r));
    }
    static getMaps(query, callback) {
        DBManager.db.collection('maps').find(query).toArray().then(r => callback(r));
    }
    static getMapScrollActions(callback) {
        DBManager.db.collection('map_scroll_actions').find({}).toArray().then(r => callback(r));
    }
    static getExperiences(callback) {
        DBManager.db.collection('experiences').find({}).toArray().then(r => callback(r));
    }
    static getSmileys(callback) {
        DBManager.db.collection('smileys').find({}).toArray().then(r => callback(r));
    }
    static getSmiley(query, callback) {
        DBManager.db.collection('smileys').findOne(query).then(r => callback(r));
    }
    static getInteractivesObjects(callback) {
        DBManager.db.collection('interactives_objects').find({}).toArray().then(r => callback(r));
    }
    static getMapPositions(callback) {
        DBManager.db.collection('maps_positions').find({}).toArray().then(r => callback(r));
    }
    static getEmotes(callback) {
        DBManager.db.collection('emoticons').find({}).toArray().then(r => callback(r));
    }
    static getItems(callback) {
        DBManager.db.collection('items').find({}).toArray().then(r => callback(r));
    }
    static getItemsSets(callback) {
        DBManager.db.collection('items_sets').find({}).toArray().then(r => callback(r));
    }
    static getSpells(callback) {
        DBManager.db.collection('spells').find({}).toArray().then(r => callback(r));
    }
    static getElements(callback) {
        DBManager.db.collection('elements').find({}).toArray().then(r => callback(r));
    }
    static getNpcs(callback) {
        DBManager.db.collection('Npcs').find({}).toArray().then(r => callback(r));
    }
    static getNpcActions(callback) {
        DBManager.db.collection('npcs_actions').find({}).toArray().then(r => callback(r));
    }
    static getNpcMessages(callback) {
        DBManager.db.collection('npcs_messages').find({}).toArray().then(r => callback(r));
    }
    static getNpcReplies(callback) {
        DBManager.db.collection('npcs_replies').find({}).toArray().then(r => callback(r));
    }
    static getNpcItems(callback) {
        DBManager.db.collection('npcs_items').find({}).toArray().then(r => callback(r));
    }
    static getNpcSpawns(callback) {
        DBManager.db.collection('npcs_spawns').find({}).toArray().then(r => callback(r));
    }
    static getSpellsLevels(callback) {
        DBManager.db.collection('spells_levels').find({}).toArray().then(r => callback(r));
    }
    static getMonsters(callback) {
        DBManager.db.collection('monsters').find({}).toArray().then(r => callback(r));
    }

    // --- Inventario ---

    static createItembag(bag, callback) {
        DBManager.getNextSequence("items_bags").then(autoIndex => {
            DBManager.db.collection("items_bags").insertOne({
                _id: autoIndex,
                items: bag.items,
                money: bag.money,
            }).then(() => {
                bag._id = autoIndex;
                callback(bag);
            });
        });
    }

    static getBag(_id, callback) {
        DBManager.db.collection('items_bags').find({ _id: _id }).toArray()
            .then(bags => callback(bags.length > 0 ? bags[0] : null));
    }

    static saveItembag(bag, query, callback) {
        DBManager.db.collection('items_bags').updateOne({ _id: bag._id }, { $set: query })
            .then(() => callback())
            .catch(() => callback());
    }
}

module.exports = DBManager
