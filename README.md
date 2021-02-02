# yarnspinner-commandschema README

yarnspinner-commandschema is a Diagnositic plugin for YarnSpinner.

## Features

Basic validation of YarnSpinner .yarn files, including limited command parameter validation.

TODO: Insert a screenshot here

## Requirements

This plugin depends on the [SecretLab.yarn-spinner](https://marketplace.visualstudio.com/items?itemName=SecretLab.yarn-spinner) language plugin.

## Extension Settings

This extension contributes the following settings:

- `YarnSpinner.commandValidationSchema`: Configure a schema for command validation

```json
{
    "YarnSpinner.commandValidationSchema": {
        "commands": {
            "stop": {"maxArgs": 0},
            "if": {"minArgs": 1},
            "else": {"maxArgs": 0},
            "elseif": {"minArgs": 1},
            "endif": {"maxArgs": 0},
            "wait": {"minArgs": 1, "maxArgs": 1, "types": ["number"]},
            "SetDirection": {"minArgs": 2, "types": ["string", "direction"]},
            "Move": {"minArgs": 2, "maxArgs": 3, "types": ["string", "direction", "number"]}
        },
        "enums": {
            "direction": ["up", "down", "left", "right", "forward", "backward"]
        }
    }
}
```

## Known Issues

- Builtin commands must be manually specified in `YarnSpinner.commandValidationSchema`

## Release Notes

### 0.0.4

- Don't parse conditional choices as commands

### 0.0.3

- Allow extra newlines at EOF (after `===` marker)

### 0.0.2

- Hot reload schema on configuration changes

### 0.0.1

- Initial release.
