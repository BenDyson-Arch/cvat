import Capacitor

final class LocalBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginType(LocalProjectStorePlugin.self)
    }
}
