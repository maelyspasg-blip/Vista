import { useRef } from "react";
import { View, type ViewProps } from "react-native";

export type RectCible = { x: number; y: number; width: number; height: number };

// Wrapper transparent qui mesure la position ABSOLUE à l'écran de son
// contenu (measureInWindow, pas onLayout seul — onLayout ne donne qu'une
// position relative au parent, insuffisant pour positionner un overlay
// plein écran superposé à toute la page). Utilisé pour faire des "trous"
// dans TutorielOverlay.
export function CibleTutoriel({
  id,
  onMesure,
  children,
  style,
  ...rest
}: {
  id: string;
  onMesure: (id: string, rect: RectCible) => void;
} & ViewProps) {
  const ref = useRef<View>(null);

  const mesurer = () => {
    // collapsable={false} ci-dessous empêche Android d'aplatir cette View
    // (ce qui casserait measureInWindow en lui faisant mesurer le mauvais
    // noeud natif).
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) onMesure(id, { x, y, width, height });
    });
  };

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={mesurer}
      style={style}
      {...rest}
    >
      {children}
    </View>
  );
}
