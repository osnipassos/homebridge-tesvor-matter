<p align="center">
  <img src="homebridge-tesvor-matter.png" height="200px">
</p>

# Homebridge Tesvor

[![npm](https://img.shields.io/npm/v/homebridge-tesvor-matter?style=flat-square)](https://www.npmjs.com/package/homebridge-tesvor-matter)
[![Downloads](https://img.shields.io/npm/dt/homebridge-tesvor-matter)](https://www.npmjs.com/package/homebridge-tesvor-matter)
[![GitHub last commit](https://img.shields.io/github/last-commit/osnipassos/homebridge-tesvor-matter?style=flat-square)](https://github.com/osnipassos/homebridge-tesvor-matter)

Plugin para [Homebridge 2.0](https://homebridge.io) que expõe aspiradores robô **Tesvor / WeBack** como dispositivos **Matter nativos** no Apple Home (iOS 18+).

O aspirador aparece com a categoria correta de **Robot Vacuum Cleaner** no app Casa, com suporte completo a:

- Iniciar / pausar / retomar limpeza
- Retornar à base (Go Home)
- Estado de bateria em tempo real
- Estados operacionais: limpando, buscando carregador, carregando, ancorado, parado

## Requisitos

| Componente | Versão mínima |
|---|---|
| Homebridge | **2.0.0** com Matter habilitado |
| Node.js | **18.20.4** (recomendado: 20.x LTS) |
| iOS / macOS | 18+ (para interface nativa de aspirador) |

> **Matter deve estar habilitado** nas configurações do Homebridge. Acesse *Homebridge UI → Configurações → Matter* e ative a opção.

## Instalação

Via Homebridge UI (recomendado): pesquise por `homebridge-tesvor-matter` na aba Plugins.

Via terminal:

```bash
sudo npm install -g homebridge-tesvor-matter
```

## Configuração

Adicione ao `config.json` do Homebridge ou use a interface gráfica:

```json
{
  "platforms": [
    {
      "platform": "HomebridgeTesvorMatter",
      "username": "seu@email.com",
      "password": "sua-senha",
      "country": "0055",
      "startMode": "AutoClean",
      "stopMode": "BackCharging",
      "fanMode": "Normal",
      "appName": "WeBack"
    }
  ]
}
```

### Parâmetros

| Campo | Obrigatório | Descrição |
|---|---|---|
| `username` | Sim | E-mail ou telefone da conta WeBack (telefone sem código do país) |
| `password` | Sim | Senha da conta WeBack |
| `country` | Sim | Código do país — Brasil: `0055`, Alemanha: `0049` |
| `startMode` | Sim | Modo de limpeza ao iniciar: `AutoClean`, `EdgeClean`, `SpotClean`, `RoomClean`, `SmartClean` |
| `stopMode` | Sim | Ação ao parar: `BackCharging` (retorna à base) ou `Standby` (para no lugar) |
| `fanMode` | Sim | Potência de sucção: `Normal` ou `Strong` |
| `appName` | Sim | App original do dispositivo: `WeBack` ou `Redmond` |

## Clusters Matter implementados

| Cluster | Função |
|---|---|
| `RvcRunMode` | Modos Idle / Cleaning |
| `RvcOperationalState` | Stopped / Running / Paused / Seeking Charger / Charging / Docked |
| `PowerSource` | Percentual de bateria, nível de carga, estado de carregamento |

## Comunicação com o dispositivo

O plugin autentica via API REST da WeBack (`grit-cloud.com`) e mantém uma conexão WebSocket persistente para receber atualizações de estado em tempo real. Comandos são enviados via AWS IoT MQTT shadow.

## Roadmap

- [ ] Suporte a múltiplos modos de limpeza como modos distintos no Matter (RvcCleanMode)
- [ ] Mapeamento de erros do dispositivo para `operationalError`

## Créditos

Fork de [marcelkordek/homebridge-tesvor-matter](https://github.com/marcelkordek/homebridge-tesvor-matter), reescrito para Homebridge 2.0 + Matter por [osnipassos](https://github.com/osnipassos).

## Licença

Apache-2.0
