#!/usr/bin/env swift

import Foundation
import PDFKit

struct PoolEntry {
    let generic: String
    let brand: String
    let medicationClass: String
    let category: String
    let moa: String
    let lab: Int
}

func normalize(_ value: String) -> String {
    let lowered = value.lowercased()
    let cleaned = lowered.replacingOccurrences(
        of: "[^a-z0-9]+",
        with: " ",
        options: .regularExpression
    )
    return cleaned.replacingOccurrences(
        of: "\\s+",
        with: " ",
        options: .regularExpression
    ).trimmingCharacters(in: .whitespacesAndNewlines)
}

func splitBrands(_ value: String) -> [String] {
    guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
    return value
        .split(whereSeparator: { ";,/".contains($0) })
        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
}

func stripTrailingQualifier(_ value: String) -> String {
    value.replacingOccurrences(
        of: "\\s*\\([^)]*\\)\\s*$",
        with: "",
        options: .regularExpression
    ).trimmingCharacters(in: .whitespacesAndNewlines)
}

func genericAppearsInPDF(_ generic: String, normalizedPDFText: String) -> Bool {
    let normalizedGeneric = normalize(generic)
    if normalizedPDFText.contains(normalizedGeneric) {
        return true
    }

    if generic.contains("/") {
        let pieces = generic
            .split(separator: "/")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard !pieces.isEmpty else { return false }

        return pieces.allSatisfy { piece in
            let normalizedPiece = normalize(piece)
            if normalizedPDFText.contains(normalizedPiece) {
                return true
            }

            let fallbackLength = min(5, normalizedPiece.count)
            guard fallbackLength > 0 else { return false }
            let prefix = String(normalizedPiece.prefix(fallbackLength))
            return normalizedPDFText.contains(prefix)
        }
    }

    return false
}

func extractPDFText(at path: String) throws -> String {
    let url = URL(fileURLWithPath: path)
    guard let document = PDFDocument(url: url) else {
        throw NSError(domain: "audit-top-drugs-pdfs", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "Unable to open PDF at \(path)"
        ])
    }

    var pages: [String] = []
    for index in 0..<document.pageCount {
        if let text = document.page(at: index)?.string {
            pages.append(text)
        }
    }
    return pages.joined(separator: "\n")
}

func loadPoolEntries(from path: String) throws -> [PoolEntry] {
    let data = try Data(contentsOf: URL(fileURLWithPath: path))
    guard let json = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
        throw NSError(domain: "audit-top-drugs-pdfs", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "master_pool.json is not an array"
        ])
    }

    return json.compactMap { item in
        guard
            let generic = item["generic"] as? String,
            let brand = item["brand"] as? String,
            let medicationClass = item["class"] as? String,
            let category = item["category"] as? String,
            let moa = item["moa"] as? String,
            let metadata = item["metadata"] as? [String: Any],
            let lab = metadata["lab"] as? Int
        else {
            return nil
        }

        return PoolEntry(
            generic: generic,
            brand: brand,
            medicationClass: medicationClass,
            category: category,
            moa: moa,
            lab: lab
        )
    }
}

let arguments = CommandLine.arguments
var positionalArguments: [String] = []
var jsonOutputPath: String?

var index = 1
while index < arguments.count {
    let argument = arguments[index]
    if argument == "--json-output" {
        guard index + 1 < arguments.count else {
            fputs("Error: --json-output requires a file path.\n", stderr)
            exit(1)
        }
        jsonOutputPath = arguments[index + 1]
        index += 2
        continue
    }

    positionalArguments.append(argument)
    index += 1
}

guard positionalArguments.count == 2 else {
    fputs("Usage: swift tools/audit-top-drugs-pdfs.swift <lab1.pdf> <lab2.pdf> [--json-output <file>]\n", stderr)
    exit(1)
}

let fileManager = FileManager.default
let repoRoot = fileManager.currentDirectoryPath
let poolPath = "\(repoRoot)/assets/data/master_pool.json"
let lab1Path = positionalArguments[0]
let lab2Path = positionalArguments[1]

do {
    let entries = try loadPoolEntries(from: poolPath)
    let lab1Text = normalize(try extractPDFText(at: lab1Path))
    let lab2Text = normalize(try extractPDFText(at: lab2Path))

    var missingGenerics: [(Int, String)] = []
    var missingBrands: [(Int, String, String)] = []

    for entry in entries {
        let pdfText = entry.lab == 1 ? lab1Text : lab2Text

        if !genericAppearsInPDF(entry.generic, normalizedPDFText: pdfText) {
            missingGenerics.append((entry.lab, entry.generic))
        }

        for brand in splitBrands(entry.brand) {
            let stripped = stripTrailingQualifier(brand)
            guard !stripped.isEmpty else { continue }
            if !pdfText.contains(normalize(stripped)) {
                missingBrands.append((entry.lab, entry.generic, stripped))
            }
        }
    }

    let suspectPhrases = [
        "Horomone Replacement",
        "degredation",
        "vasoconstricton",
        "Agent Alpha-1 Antagonist",
        "Beta-Blocker",
        "Rapid-acting insulin",
        "Serotonin 5-HT1B,2D Receptor Agonist",
        "Serotonin 5-HT1B, 2D Receptor Agonist "
    ]

    let flaggedEntries = entries.filter { entry in
        let combined = "\(entry.generic) | \(entry.medicationClass) | \(entry.category) | \(entry.moa)"
        return suspectPhrases.contains { combined.contains($0) }
    }

    let statusLabel: String
    let statusBadge: String
    let statusSummary: String
    if missingGenerics.isEmpty && missingBrands.isEmpty && flaggedEntries.isEmpty {
        statusLabel = "Clean"
        statusBadge = "PDF Audit Clean"
        statusSummary = "No missing generics, missing brand aliases, or cleanup phrases were flagged in this audit."
    } else if missingGenerics.isEmpty && missingBrands.isEmpty {
        statusLabel = "Notes"
        statusBadge = "PDF Audit Notes"
        statusSummary = "Core coverage checks passed, but cleanup phrases are still flagged for review."
    } else {
        statusLabel = "Attention"
        statusBadge = "PDF Audit Attention"
        statusSummary = "The audit found missing generic or brand coverage that still needs review."
    }

    let auditPayload: [String: Any] = [
        "auditedAt": ISO8601DateFormatter().string(from: Date()),
        "statusLabel": statusLabel,
        "statusBadge": statusBadge,
        "statusSummary": statusSummary,
        "sourceDocuments": [
            "lab1": URL(fileURLWithPath: lab1Path).lastPathComponent,
            "lab2": URL(fileURLWithPath: lab2Path).lastPathComponent
        ],
        "poolEntries": entries.count,
        "lab1Entries": entries.filter { $0.lab == 1 }.count,
        "lab2Entries": entries.filter { $0.lab == 2 }.count,
        "missingGenericsCount": missingGenerics.count,
        "missingBrandAliasesCount": missingBrands.count,
        "flaggedEntriesCount": flaggedEntries.count,
        "missingGenerics": missingGenerics.map { ["lab": $0.0, "generic": $0.1] },
        "missingBrandAliases": missingBrands.map { ["lab": $0.0, "generic": $0.1, "brand": $0.2] },
        "flaggedEntries": flaggedEntries.map { ["lab": $0.lab, "generic": $0.generic] },
        "suspectPhrases": suspectPhrases
    ]

    if let outputPath = jsonOutputPath {
        let url = URL(fileURLWithPath: outputPath)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let jsonData = try JSONSerialization.data(withJSONObject: auditPayload, options: [.prettyPrinted, .sortedKeys])
        try jsonData.write(to: url)
    }

    print("Top Drugs PDF Audit")
    print("===================\n")
    print("Pool entries: \(entries.count)")
    print("Lab 1 entries: \(entries.filter { $0.lab == 1 }.count)")
    print("Lab 2 entries: \(entries.filter { $0.lab == 2 }.count)\n")

    print("Missing generics in PDF text: \(missingGenerics.count)")
    for (lab, generic) in missingGenerics {
        print("- Lab \(lab): \(generic)")
    }

    print("\nMissing brand aliases in PDF text: \(missingBrands.count)")
    for (lab, generic, brand) in missingBrands {
        print("- Lab \(lab): \(generic) -> \(brand)")
    }

    print("\nPool entries containing likely cleanup phrases: \(flaggedEntries.count)")
    for entry in flaggedEntries {
        print("- Lab \(entry.lab): \(entry.generic)")
    }
} catch {
    fputs("Error: \(error.localizedDescription)\n", stderr)
    exit(1)
}
