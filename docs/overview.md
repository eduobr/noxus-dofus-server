# Noxus — Project Overview

## Propósito

Noxus es un emulador de servidor privado para **Dofus 2.39**, el MMORPG táctico
por turnos de Ankama. Permite ejecutar un servidor de juego independiente al que
los clientes oficiales de Dofus pueden conectarse.

## Estado del proyecto

- **Versión**: Alpha v1.1
- **Última actividad detectada**: Noviembre 2016
- **Autores**: Yuki, Arkalius, Yamisaaf
- **Repositorio original**: Azure DevOps (`nightwolfdev.visualstudio.com`)

## Stack principal

| Componente      | Tecnología                        |
|-----------------|-----------------------------------|
| Lenguaje        | JavaScript ES6/ES2015             |
| Transpilador    | Babel 6 (preset es2015)           |
| Runtime         | Node.js                           |
| Base de datos   | MongoDB 2.2                       |
| Serialización   | Binario manual (BigEndian + VarInt) |
| Protocolo       | Dofus 2.39 (protocol ID 1738)     |
| Pathfinding     | Dijkstra (`node-dijkstra`)        |
| Testing         | No implementado                   |
| CI/CD           | No implementado                   |

## Módulos principales

| Módulo               | Ruta              | Responsabilidad                              |
|----------------------|-------------------|----------------------------------------------|
| App entry point      | `src/app.js`      | Orquestación de arranque                     |
| Auth Server          | `src/network/`    | Servidor TCP de autenticación (puerto 443)   |
| World Server         | `src/network/`    | Servidor TCP de mundo (puerto 5556)          |
| Protocol Messages    | `src/io/dofus/`   | Serialización del protocolo Dofus 2.39       |
| Handlers             | `src/handlers/`   | 15 manejadores de mensajes por dominio       |
| Game Logic           | `src/game/`       | Combate, hechizos, pathfinding, NPCs, grupos |
| Database             | `src/database/`   | Acceso a MongoDB + carga de datos en RAM     |
| Data Extraction      | `tools/`          | Lectura de archivos .d2o/.d2i del cliente    |
| Game Data            | `db/`             | Datos de juego en JSON (importables a MongoDB) |

## Lo que es código propio

Todo el código en `src/` es original del equipo Noxus. Esto incluye:

- La lógica completa de servidor (auth, world, handlers)
- El sistema de combate por turnos (~900 líneas en `fight.js`)
- El motor de hechizos, buffs y efectos (~80 archivos)
- El pathfinding hexagonal (Dijkstra + algoritmo Dofus1Line)
- El sistema de NPCs, diálogos y comercio
- El sistema de grupos e intercambios

## Lo que depende de Ankama

- **El protocolo de red**: los `messageId` y la estructura de mensajes son
  ingeniería inversa del protocolo propietario de Dofus 2.39. Si Ankama cambia
  su protocolo, este servidor deja de funcionar con clientes actualizados.
- **El cliente**: el archivo `patch/DofusInvoker.swf` es el cliente de Ankama
  modificado para apuntar a este servidor.
- **Los datos de juego**: los archivos `.d2o` en `tools/Noxus-D2OReader/data/`
  son extraídos del cliente oficial de Ankama.
- **Las reglas y fórmulas**: replican el comportamiento del juego oficial para
  mantener compatibilidad con el cliente.

## Lo que es personalizable

Prácticamente todo excepto el protocolo de red y el formato de datos:

- Puertos, IPs, mensajes de bienvenida (`config.json`)
- Razas disponibles, nivel inicial, kamas iniciales
- Cooldowns de canales de chat
- Stats de items, razas, hechizos (editando los JSON en `db/`)
- Diálogos de NPCs, nuevos NPCs
- Sistema de combate, efectos de hechizos (requiere programación)
- Tablas de experiencia
- Comandos de administrador
