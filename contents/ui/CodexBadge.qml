import QtQuick
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami

// Small circled "O" that marks the Codex metrics in the panel (fork addition),
// with a red dot when the last Codex read failed.
Item {
    id: badge

    property int size: Kirigami.Units.iconSizes.smallMedium
    property bool hasError: false

    implicitWidth: size
    implicitHeight: size

    Rectangle {
        anchors.fill: parent
        radius: width / 2
        color: "transparent"
        border.color: Kirigami.Theme.textColor
        border.width: Math.max(1.5, badge.size / 14)

        PlasmaComponents.Label {
            anchors.centerIn: parent
            text: "O"
            font.bold: true
            font.pixelSize: Math.max(7, Math.round(badge.size * 0.5))
        }
    }

    Rectangle {
        visible: badge.hasError
        width: Math.max(8, Math.round(badge.size / 3))
        height: width
        radius: width / 2
        color: Kirigami.Theme.negativeTextColor
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.rightMargin: -2
        anchors.bottomMargin: -2
    }
}
