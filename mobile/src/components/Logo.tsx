import React from "react";
import { Image, StyleSheet } from "react-native";

const LOGO = require("@/assets/images/logo.png");
const LOGO_LIGHT = require("@/assets/images/logo-light.png");

export default function Logo({ size = 42, light = false }: { size?: number; light?: boolean }) {
  return <Image source={light ? LOGO_LIGHT : LOGO} style={[styles.logo, { width: size, height: size }]} resizeMode="contain" />;
}

const styles = StyleSheet.create({ logo: {} });
