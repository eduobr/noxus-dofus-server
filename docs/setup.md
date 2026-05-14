# Noxus — Setup Guide

## Requisitos

| Componente    | Versión requerida     | Notas                                     |
|---------------|-----------------------|-------------------------------------------|
| Node.js       | *Pendiente confirmar* | El proyecto usa Babel 6 (2016). Node 6-8  |
|               |                       | probablemente. Con Node moderno puede     |
|               |                       | requerir ajustes.                         |
| MongoDB       | 2.2.x                 | Puerto por defecto: 27017                 |
| npm           | *Pendiente confirmar* | Sin package-lock.json. npm < 5 asumido.   |
| SO            | Linux / Windows       | Probado en ambos. desktop.ini sugiere Win. |

## Instalación

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd Dofus
```

### 2. Instalar dependencias

```bash
npm install
```

Esto instalará las dependencias listadas en `package.json`:

- `mongodb` ^2.2.11
- `mongodb-autoincrement` ^1.0.1
- `babel-cli` ^6.18.0
- `babel-plugin-transform-async-to-generator` ^6.16.0
- `babel-plugin-transform-class-properties` ^6.19.0
- `babel-preset-es2015` ^6.18.0
- `arraybuffer-to-buffer` 0.0.4
- `base64-js` ^1.2.0
- `colors` ^1.1.2
- `node-dijkstra` ^2.3.0

### 3. Configurar MongoDB

Asegúrate de que MongoDB esté corriendo en `localhost:27017`:

```bash
# Linux
sudo systemctl start mongod

# macOS
brew services start mongodb-community

# Windows
net start MongoDB
```

### 4. Importar datos de juego

Los datos de juego están en la carpeta `db/` como archivos JSON. Deben
importarse a MongoDB en la base de datos `Noxus` (nombre configurable en
`config.json`).

*Pendiente por confirmar*: No se encontró un script de importación automática.
Posiblemente se usaba `mongoimport` manualmente o los tools en `tools/` para
poblar la base de datos desde cero.

Ejemplo manual:
```bash
mongoimport --db Noxus --collection breeds --file db/breeds.json
mongoimport --db Noxus --collection spells --file db/spells.json
# ... repetir para cada JSON en db/
```

### 5. Configurar el servidor

Editar `config.json` según necesidades:

```json
{
  "host": "127.0.0.1",
  "auth_port": "443",
  "world_port": "5556",
  "server_name": "Noxus",
  "server_id": "1",
  "welcome_message": "Bienvenue sur la beta v1.0 de Noxus",
  "max_characters": "5",
  "mongodb": {
    "host": "localhost",
    "port": "27017",
    "database": "Noxus"
  },
  "breeds_allowed": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  "characters_start": {
    "level": "150",
    "kamas": "150000",
    "startMap": "173277699",
    "startCell": "328",
    "startDir": "1"
  },
  "time_channel": {
    "sales": "60",
    "seek": "30",
    "global_time_per_message": "0.5",
    "global_time_on_exceeded": "10"
  }
}
```

### 6. Compilar (transpilar con Babel)

```bash
# Compilación única
./node_modules/.bin/babel src --out-dir dist

# Compilación con watch (desarrollo)
./compilation.sh
# Equivalente a: node_modules/babel-cli/bin/babel.js src --out-dir dist -w
```

La carpeta `dist/` está en `.gitignore` y contiene el código transpilado de
ES6 a ES5.

### 7. Ejecutar el servidor

*Pendiente por confirmar*: No se encontró un script de inicio. Asumiendo que
se ejecuta el entry point transpilado:

```bash
node dist/app.js
```

O directamente con babel-node (desarrollo):

```bash
./node_modules/.bin/babel-node src/app.js
```

### 8. Configurar el cliente

El archivo `patch/DofusInvoker.swf` es un cliente Dofus modificado que apunta
al servidor local (127.0.0.1). Requiere Adobe Flash Player o un emulador.

## Verificación

Al iniciar correctamente, deberías ver en consola:

```
    _   _
   | \ | |
   |  \| | _____  ___   _ ___
   | . ` |/ _ \ \/ / | | / __|    Emulator for Dofus 2.39
   | |\  | (_) >  <| |_| \__ \    By Yuki, Arkalius and Yamisaaf
   \_| \_/\___/_/\_\\__,_|___/    ALPHA VERSION v1.1
 _________________________________________________________________

[INFOS] : Loading configuration file ..
[INFOS] : Configuration file loaded successfully !
[INFOS] : Trying to connect to MongoDB ..
[INFOS] : Connected to MongoDB
[INFOS] : Loaded '17' breed(s)
[INFOS] : Loaded 'X' item(s)
...
[INFOS] : Auth server started on 127.0.0.1:443
[INFOS] : World server started on 127.0.0.1:5556
[INFOS] : Server started successfully !
```

## Problemas comunes

### "Error: Cannot find module 'babel-cli'"
```bash
npm install
```

### MongoDB connection refused
Verificar que MongoDB está corriendo:
```bash
mongosh --eval "db.runCommand({ ping: 1 })"
```

### Puerto 443 requiere permisos root
En Linux, puertos < 1024 requieren `sudo`. Alternativa: cambiar `auth_port` en
`config.json` a un puerto alto (ej. 8443) y ajustar el cliente .swf.

### Error de versión de Node.js
El proyecto fue desarrollado circa 2016. Con Node.js moderno puede fallar por
APIs deprecadas. Se recomienda usar nvm para instalar Node 6-8:
```bash
nvm install 8
nvm use 8
```

### Archivos .d2o no encontrados por los tools
Los tools en `tools/Noxus-D2OReader/` esperan archivos `.d2o` del cliente
oficial de Dofus en la carpeta `data/`. Estos archivos no se distribuyen con
el repositorio.
