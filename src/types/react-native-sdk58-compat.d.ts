import 'react-native';

declare module 'react-native' {
  export namespace StyleSheet {
    export const absoluteFillObject: AbsoluteFillStyle;
  }

  export namespace InteractionManager {
    export function runAfterInteractions(
      task?: (() => any) | { name: string; gen: () => Promise<any> },
    ): {
      then: (onfulfilled?: () => any, onrejected?: () => any) => Promise<any>;
      done: (...args: any[]) => any;
      cancel: () => void;
    };
    export function createInteractionHandle(): number;
    export function clearInteractionHandle(handle: number): void;
    export function setDeadline(deadline: number): void;
  }
}
