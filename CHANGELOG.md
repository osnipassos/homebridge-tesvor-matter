# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2026-06-03

### Fixed

- Re-autenticação forçada ao receber HTTP 403 no WebSocket WeBack
- Backoff exponencial na reconexão: 15 → 30 → 60 → 120 → 300s (evita rate limiting)
- Para automaticamente após 10 erros consecutivos com log de diagnóstico

---

## [2.0.0] - 2026-06-02

Complete rewrite by [osnipassos](https://github.com/osnipassos), forked from [marcelkordek/homebridge-tesvor](https://github.com/marcelkordek/homebridge-tesvor).

### Added

- **Matter RVC native support** — aspirador exposto como `RoboticVacuumCleaner` via `api.matter` do Homebridge 2.0, visível com ícone e controles nativos no Apple Home (iOS 18+)
- **`RvcRunMode` cluster** — modos Idle e Cleaning
- **`RvcCleanMode` cluster** — 5 modos de limpeza selecionáveis: Auto Clean, Edge Clean, Spot Clean, Room Clean, Smart Clean; ao trocar o modo com o robô em operação, o comando é enviado imediatamente
- **`RvcOperationalState` cluster** — estados: Stopped, Running, Paused, Seeking Charger, Charging, Docked, Error; `operationalError` mapeado para status desconhecidos do dispositivo
- **`PowerSource` cluster** — percentual de bateria em tempo real, nível de carga (Ok/Warning) e estado de carregamento
- WebSocket keepalive com ping a cada 30 segundos e timeout de inatividade de 5 minutos
- Suporte a reconexão automática do WebSocket

### Changed

- Requisito mínimo: **Node.js 18.20.4** e **Homebridge 2.0.0**
- Removidas as opções `accessoryType` (Switch/TV) e `accessoryCategory` do config — substituídas pela integração Matter nativa
- Conversão completa de `src/lib/*.js` para TypeScript com tipagem estrita
- `config.schema.json` atualizado com textos em PT-BR e campos relevantes para o novo modo de operação
- `PLUGIN_NAME` renomeado para `homebridge-tesvor-matter` e `PLATFORM_NAME` para `HomebridgeTesvorMatter`

### Removed

- `switchAccessory.ts` — substituído por `vacuumAccessory.ts` com Matter
- `tvAccessory.ts` — removido (implementação incompleta do plugin original)
- `aws-sdk` v2 e `aws-iot-device-sdk` — não utilizados na nova arquitetura (comunicação via WebSocket WeBack)

---

## [1.0.12] — marcelkordek (histórico)

Última versão do fork original antes da reescrita. Histórico completo em:
https://github.com/marcelkordek/homebridge-tesvor/blob/master/CHANGELOG.md
