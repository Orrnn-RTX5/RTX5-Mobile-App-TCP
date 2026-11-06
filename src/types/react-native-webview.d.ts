import { Component } from 'react';
import {
  IOSWebViewProps,
  AndroidWebViewProps,
  WindowsWebViewProps,
} from '../../node_modules/react-native-webview/lib/WebViewTypes';

export {
  FileDownload,
  WebViewMessageEvent,
  WebViewNavigation,
} from '../../node_modules/react-native-webview/lib/WebViewTypes';

export type WebViewProps = IOSWebViewProps & AndroidWebViewProps & WindowsWebViewProps;

declare class WebView<P = {}> extends Component<WebViewProps & P> {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stopLoading(): void;
  injectJavaScript: (script: string) => void;
  requestFocus: () => void;
  postMessage: (message: string) => void;
  clearFormData?: () => void;
  clearCache: (includeDiskFiles: boolean) => void;
  clearHistory?: () => void;
}

export { WebView };
export default WebView;
