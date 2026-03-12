import {AppRegistry, LogBox} from 'react-native';
import {App} from './src/App';
import {name as appName} from './app.json';

LogBox.ignoreAllLogs();

const MANIFEST_COMPONENT_ID = 'com.bensvega.crapsparty.main';
const createApp = () => App;

AppRegistry.registerComponent(MANIFEST_COMPONENT_ID, createApp);
AppRegistry.registerComponent(appName, createApp);
