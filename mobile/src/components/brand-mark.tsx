import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import logo from '../../assets/images/splash-icon.png';

type BrandMarkProps = {
  size?: number;
};

export function BrandMark({ size = 36 }: BrandMarkProps) {
  const radius = Math.round(size * 0.22);
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: radius }]}>
      <Image
        source={logo}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="contain"
        accessibilityLabel="ehllo"
        alt="ehllo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});
