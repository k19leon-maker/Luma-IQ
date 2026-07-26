declare module 'word-extractor' {
  class WordExtractor {
    extract(input: Buffer): Promise<{ getBody(): string }>;
  }

  export default WordExtractor;
}
