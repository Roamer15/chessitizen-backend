declare module 'stockfish.wasm' {
  export interface StockfishEngine {
    postMessage(message: string): void;
    onmessage?: (event: { data: string } | string) => void;
    terminate?: () => void;
  }

  export default function Stockfish(): Promise<StockfishEngine>;
}
