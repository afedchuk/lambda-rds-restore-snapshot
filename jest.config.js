module.exports = {
    collectCoverage: true,
    coverageReporters: ["text","html", "text-summary"],

    testRegex: "(/__tests__/.*|\\.(test|spec))\\.(ts|tsx|js)$",
    moduleFileExtensions: ["ts", "tsx", "js"],
    globals: {
        "ts-jest": {
            "diagnostics": false,
        }

    },
    preset: "ts-jest",
    verbose: true,
}