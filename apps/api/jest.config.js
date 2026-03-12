"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    rootDir: "./",
    testEnvironment: "node",
    testRegex: ".*\\.spec\\.ts$",
    transform: {
        "^.+\\.ts$": [
            "ts-jest",
            {
                tsconfig: "<rootDir>/tsconfig.json"
            }
        ]
    },
    moduleFileExtensions: ["ts", "js", "json"],
    collectCoverageFrom: ["src/**/*.ts"]
};
exports.default = config;
