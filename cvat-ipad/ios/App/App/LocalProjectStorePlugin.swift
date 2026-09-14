import Capacitor
import Foundation

@objc(LocalProjectStorePlugin)
public final class LocalProjectStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LocalProjectStorePlugin"
    public let jsName = "LocalProjectStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
    ]

    @objc func save(_ call: CAPPluginCall) {
        guard let suppliedID = call.getString("id"), let projectID = UUID(uuidString: suppliedID) else {
            call.reject("A valid project identifier is required.")
            return
        }
        guard let value = call.getString("data"), let data = value.data(using: .utf8) else {
            call.reject("Project data must be a UTF-8 string.")
            return
        }

        do {
            // Directory.Data maps to the app Documents directory on iOS. The UUID
            // component prevents input from selecting an arbitrary path.
            let documents = try FileManager.default.url(
                for: .documentDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            let directory = documents
                .appendingPathComponent("projects", isDirectory: true)
                .appendingPathComponent(projectID.uuidString.lowercased(), isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let destination = directory.appendingPathComponent("project.json", isDirectory: false)
            try data.write(to: destination, options: .atomic)
            call.resolve()
        } catch {
            call.reject("Could not save this project on the device.", nil, error)
        }
    }
}
