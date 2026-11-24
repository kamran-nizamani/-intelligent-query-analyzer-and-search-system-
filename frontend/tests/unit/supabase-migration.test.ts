import { describe, expect, it } from "vitest";
import {
  chunkProseText,
  chunkSourceCode,
  splitIdentifier,
  searchableCode,
} from "@/lib/chunking/chunker";
import { getFileExtension, isCodeFile, validateExtractedPdfText } from "@/lib/extractors/client-extractors";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { tokenizeQuery, parseTokens, compileQueryTrace } from "@/lib/compiler-engine";

describe("Supabase-Only Migration Unit Tests", () => {
  describe("AT-01 & AT-02: Compiler Tokenizer & Parser", () => {
    it("tokenizes query with action, language, target and limit", () => {
      const tokens = tokenizeQuery('find Python functions with "csv reader" limit 5');
      const kinds = tokens.map((t) => t.kind);
      expect(kinds).toContain("ACTION");
      expect(kinds).toContain("LANGUAGE");
      expect(kinds).toContain("TARGET");
      expect(kinds).toContain("RELATION");
      expect(kinds).toContain("PHRASE");
      expect(kinds).toContain("LIMIT");
      expect(kinds).toContain("NUMBER");
    });

    it("parses tokens into structured QueryAST", () => {
      const tokens = tokenizeQuery('find Python functions with "csv reader" limit 5');
      const ast = parseTokens(tokens, 'find Python functions with "csv reader" limit 5');
      expect(ast.action).toBe("find");
      expect(ast.target).toBe("function");
      expect(ast.language).toBe("python");
      expect(ast.topic).toBe('"csv reader"');
      expect(ast.limit).toBe(5);
    });

    it("keeps method searches distinct from function searches", () => {
      const methodTrace = compileQueryTrace("find Python methods that validate tokens");
      expect(methodTrace.ast.target).toBe("method");
      expect(methodTrace.optimizedIr.filters.symbol_kind).toBe("method");
    });

    it("compiles query into 7-stage explanation trace without network calls", () => {
      const trace = compileQueryTrace("Search Java classes that implement authentication");
      expect(trace.stages).toHaveLength(7);
      expect(trace.ast.language).toBe("java");
      expect(trace.ast.target).toBe("class");
      expect(trace.optimizedIr.filters.language).toBe("java");
      expect(trace.optimizedIr.filters.symbol_kind).toBe("class");
    });
  });

  describe("AT-06 & AT-08: Chunking & Identifier Splitting", () => {
    it("splits camelCase and snake_case identifiers correctly", () => {
      expect(splitIdentifier("AuthService")).toBe("Auth Service");
      expect(splitIdentifier("get_user_profile")).toBe("get user profile");
      expect(splitIdentifier("HttpRequestHandler")).toBe("Http Request Handler");
    });

    it("builds searchable code text with symbol name and identifiers", () => {
      const result = searchableCode(
        "verifyToken",
        "def verifyToken(token: str) -> bool",
        "Validates incoming JWT token",
        ["token", "jwt", "secretKey"],
        "return jwt.verify(token, secretKey)"
      );
      expect(result).toContain("verifyToken");
      expect(result).toContain("verify Token");
      expect(result).toContain("secret Key");
    });

    it("chunks prose text into bounded word windows", () => {
      const text = Array(300).fill("word").join(" ");
      const chunks = chunkProseText(text, 1, 180, 30);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].sourceKind).toBe("document");
      expect(chunks[0].pageNumber).toBe(1);
    });

    it("chunks source code with line ranges and symbol identification", () => {
      const samplePython = `
class AuthService:
    def authenticate(self, username, password):
        return username == "admin" and password == "secret"
      `;
      const chunks = chunkSourceCode(samplePython, "auth.py", "python");
      expect(chunks.length).toBe(1);
      expect(chunks[0].sourceKind).toBe("code");
      expect(chunks[0].symbolName).toBe("AuthService");
      expect(chunks[0].symbolKind).toBe("class");
      expect(chunks[0].language).toBe("python");
      expect(chunks[0].lineStart).toBe(1);
    });
  });

  describe("File Extension Classification", () => {

    it("accepts readable PDF text extracted by PDF.js", () => {
      const text = "Compiler-assisted hybrid search combines lexical retrieval with semantic vector search.";
      expect(validateExtractedPdfText(text)).toBe(text);
    });

    it("rejects binary-looking or empty PDF extraction instead of indexing it", () => {
      expect(() => validateExtractedPdfText("\\u0000\\u0001\\u0002%%%%%%%")).toThrow(/no readable text layer/i);
    });
\n    it("classifies code extensions and document extensions accurately", () => {
      expect(getFileExtension("main.py")).toBe("py");
      expect(isCodeFile("main.py")).toBe(true);
      expect(isCodeFile("Service.java")).toBe(true);
      expect(isCodeFile("App.tsx")).toBe(true);
      expect(isCodeFile("report.docx")).toBe(false);
      expect(isCodeFile("manual.pdf")).toBe(false);
      expect(isCodeFile("notes.txt")).toBe(false);
    });
  });

  describe("Supabase Client Configuration Guard", () => {
    it("isSupabaseConfigured returns boolean without throwing", () => {
      const configured = isSupabaseConfigured();
      expect(typeof configured).toBe("boolean");
    });
  });
});
