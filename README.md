<p align="center">
  <img src="homebridge-tesvor.png" height="200px">
</p>

# Homebridge Tesvor Matter

[![npm](https://img.shields.io/npm/v/homebridge-tesvor-matter?style=flat-square)](https://www.npmjs.com/package/homebridge-tesvor-matter)
[![Downloads](https://img.shields.io/npm/dt/homebridge-tesvor-matter)](https://www.npmjs.com/package/homebridge-tesvor-matter)
[![GitHub last commit](https://img.shields.io/github/last-commit/osnipassos/homebridge-tesvor-matter?style=flat-square)](https://github.com/osnipassos/homebridge-tesvor-matter)

[Homebridge 2.0](https://homebridge.io) plugin that exposes **Tesvor / WeBack** robot vacuum cleaners as **native Matter accessories** in Apple Home (iOS 18+).

The vacuum cleaner appears with the correct **Robot Vacuum Cleaner** category in the Home app, with full support for:

- Start / pause / resume cleaning
- Return to base (Go Home)
- Real-time battery status
- Operational states: cleaning, seeking charger, charging, docked, stopped
- Multiple cleaning modes selectable from Apple Home

## Requirements

| Component | Minimum version |
|---|---|
| Homebridge | **2.0.0** with Matter enabled |
| Node.js | **18.20.4** (recommended: 20.x LTS) |
| iOS / macOS | 18+ (for native robot vacuum interface) |

> **Matter must be enabled** in your Homebridge settings. Go to *Homebridge UI → Settings → Matter* and enable it.

> **Tip:** Set `bridge.bind` in your Homebridge settings to the Homebridge IP address (e.g. `10.0.0.x`). This ensures mDNS advertises the correct address to Home Hubs like HomePod and Apple TV, preventing "No Response" issues on iPhone.

## Installation

Via Homebridge UI (recommended): search for `homebridge-tesvor-matter` in the Plugins tab.

Via terminal:

```bash
hb-service add homebridge-tesvor-matter
```

## Configuration

Add to your Homebridge `config.json` or use the UI settings:

```json
{
  "platforms": [
    {
      "platform": "HomebridgeTesvorMatter",
      "username": "your@email.com",
      "password": "your-password",
      "country": "0049",
      "startMode": "AutoClean",
      "stopMode": "BackCharging",
      "fanMode": "Normal",
      "appName": "WeBack"
    }
  ]
}
```

### Parameters

| Field | Required | Description |
|---|---|---|
| `username` | Yes | WeBack account email or phone number (phone without country code) |
| `password` | Yes | WeBack account password |
| `country` | Yes | Country calling code — US: `0001`, UK: `0044`, Germany: `0049`, Brazil: `0055` |
| `startMode` | Yes | Cleaning mode when started: `AutoClean`, `EdgeClean`, `SpotClean`, `RoomClean`, `SmartClean` |
| `stopMode` | Yes | Action when stopped: `BackCharging` (return to base) or `Standby` (stop in place) |
| `fanMode` | Yes | Suction power: `Normal` or `Strong` |
| `appName` | Yes | Original device app: `WeBack` or `Redmond` |

## Matter Clusters

| Cluster | Function |
|---|---|
| `RvcRunMode` | Idle / Cleaning modes |
| `RvcCleanMode` | Auto Clean, Edge Clean, Spot Clean, Room Clean, Smart Clean |
| `RvcOperationalState` | Stopped / Running / Paused / Seeking Charger / Charging / Docked / Error |
| `PowerSource` | Battery percentage, charge level, charging state |

## How it works

The plugin authenticates via the WeBack REST API (`grit-cloud.com`) and maintains a persistent WebSocket connection with 30-second keepalive pings for real-time state updates. Commands are sent via WebSocket to the WeBack backend, which routes them to the device.

## Troubleshooting

**"No Response" on iPhone while Mac works**

This typically happens when a Home Hub (HomePod or Apple TV) acts as a proxy and can't reach the Homebridge device. Fix: in Homebridge UI → Settings → Homebridge → set **Network Interface** to your Homebridge IP address. This ensures mDNS advertises the correct address.

**"Updating..." never resolves**

Remove the Aécio accessory from Apple Home and re-add it using the pairing code shown in the Homebridge logs.

## Credits

Forked from [marcelkordek/homebridge-tesvor](https://github.com/marcelkordek/homebridge-tesvor), rewritten for Homebridge 2.0 + Matter by [osnipassos](https://github.com/osnipassos).

## License

Apache-2.0
