import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebaseConfig";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function AdminScreen() {
  const router = useRouter();
  const [userCount, setUserCount] = useState(0);
  const [activePercent, setActivePercent] = useState(0);
  const [alertsCount, setAlertsCount] = useState(0);
  const [activeNav, setActiveNav] = useState("home");

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const userSnapshot = await getDocs(collection(db, "Users"));
        const users = userSnapshot.docs.map((doc) => doc.data());
        setUserCount(users.length);

        const activeUsers = users.filter((u) => u.isActive).length;
        setActivePercent(
          users.length ? Math.round((activeUsers / users.length) * 100) : 0
        );

        const alertsSnapshot = await getDocs(collection(db, "Alerts"));
        setAlertsCount(alertsSnapshot.size);
      } catch (error) {
        console.error("Error fetching metrics:", error);
      }
    };

    fetchMetrics();
  }, []);

  const handleLogout = async () => {
    await AsyncStorage.removeItem("user");
    router.replace("/login");
  };

  const menuItems = [
    {
      key: "users",
      title: "User Management",
      sub: "Accounts & roles",
      icon: "people-outline",
      iconColor: "#AFA9EC",
      iconBg: "#26215C",
      badge: userCount > 0 ? `${userCount}` : "0",
      badgeStyle: styles.badgePurple,
      badgeTextStyle: styles.badgeTextPurple,
      onPress: () => router.push("/usermanagement"),
    },
    {
      key: "ai",
      title: "AI Agent Config",
      sub: "System agents & settings",
      icon: "settings-outline",
      iconColor: "#5DCAA5",
      iconBg: "#085041",
      badge: "Live",
      badgeStyle: styles.badgeTeal,
      badgeTextStyle: styles.badgeTextTeal,
      onPress: () => {},
    },
    {
      key: "logs",
      title: "Audit Logs",
      sub: "Activity & changes",
      icon: "document-text-outline",
      iconColor: "#EF9F27",
      iconBg: "#412402",
      badge: alertsCount > 0 ? `${alertsCount} new` : "0 new",
      badgeStyle: styles.badgeAmber,
      badgeTextStyle: styles.badgeTextAmber,
      onPress: () => router.push("/history"),
    },
  ];

  const navItems = [
    { key: "home", label: "Home", icon: "grid-outline" },
    { key: "settings", label: "Settings", icon: "settings-outline" },
    { key: "profile", label: "Profile", icon: "person-outline" },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* Top Bar */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.greeting}>WELCOME BACK</Text>
            <Text style={styles.topBarTitle}>Admin Dashboard</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color="#ff6b6b" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>USERS</Text>
            <Text style={[styles.statValue, styles.statBlue]}>{userCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>ACTIVE</Text>
            <Text style={[styles.statValue, styles.statGreen]}>
              {activePercent}%
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>ALERTS</Text>
            <Text style={[styles.statValue, styles.statAmber]}>
              {alertsCount}
            </Text>
          </View>
        </View>

        {/* Section Label */}
        <Text style={styles.sectionLabel}>MANAGEMENT</Text>

        {/* Menu Cards */}
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.menuCard}
            onPress={item.onPress}
            activeOpacity={0.75}
          >
            <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
              <Ionicons name={item.icon} size={20} color={item.iconColor} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSub}>{item.sub}</Text>
            </View>
            <View style={[styles.badge, item.badgeStyle]}>
              <Text style={[styles.badgeText, item.badgeTextStyle]}>
                {item.badge}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Bottom Nav */}
        <View style={styles.bottomNav}>
          {navItems.map((nav) => {
            const isActive = activeNav === nav.key;
            return (
              <TouchableOpacity
                key={nav.key}
                style={styles.navItem}
                onPress={() => setActiveNav(nav.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={nav.icon}
                  size={22}
                  color={isActive ? "#AFA9EC" : "#3a3a50"}
                />
                <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                  {nav.label}
                </Text>
                {isActive && <View style={styles.navDot} />}
              </TouchableOpacity>
            );
          })}
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:       { flex: 1, backgroundColor: "#13131a" },
  container:      { flex: 1, backgroundColor: "#13131a", paddingHorizontal: 16, paddingTop: 16 },
  topBar:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  greeting:       { fontSize: 10, color: "#6b6b80", letterSpacing: 1.2, marginBottom: 2 },
  topBarTitle:    { fontSize: 20, fontWeight: "500", color: "#ffffff" },
  logoutBtn:      { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1c1c26", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 0.5, borderColor: "#3a1a1a" },
  logoutText:     { color: "#ff6b6b", fontSize: 12, fontWeight: "500" },
  statsRow:       { flexDirection: "row", gap: 8, marginBottom: 20 },
  statCard:       { flex: 1, backgroundColor: "#1c1c26", borderRadius: 14, padding: 12 },
  statLabel:      { fontSize: 9, color: "#6b6b80", letterSpacing: 0.8, marginBottom: 6 },
  statValue:      { fontSize: 20, fontWeight: "500", color: "#ffffff" },
  statBlue:       { color: "#85B7EB" },
  statGreen:      { color: "#5DCAA5" },
  statAmber:      { color: "#EF9F27" },
  sectionLabel:   { fontSize: 10, color: "#6b6b80", letterSpacing: 1.2, marginBottom: 12 },
  menuCard:       { backgroundColor: "#1c1c26", borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 10, borderWidth: 0.5, borderColor: "#2a2a38" },
  iconWrap:       { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardText:       { flex: 1 },
  cardTitle:      { fontSize: 14, fontWeight: "500", color: "#e8e8f0", marginBottom: 2 },
  cardSub:        { fontSize: 11, color: "#6b6b80" },
  badge:          { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:      { fontSize: 10, fontWeight: "500" },
  badgePurple:    { backgroundColor: "#26215C" },
  badgeTextPurple:{ color: "#AFA9EC" },
  badgeTeal:      { backgroundColor: "#085041" },
  badgeTextTeal:  { color: "#5DCAA5" },
  badgeAmber:     { backgroundColor: "#412402" },
  badgeTextAmber: { color: "#EF9F27" },
  bottomNav:      { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-around", paddingTop: 14, paddingBottom: 24, borderTopWidth: 0.5, borderTopColor: "#1e1e2a", backgroundColor: "#13131a" },
  navItem:        { alignItems: "center", gap: 4 },
  navLabel:       { fontSize: 10, color: "#6b6b80" },
  navLabelActive: { color: "#AFA9EC" },
  navDot:         { width: 4, height: 4, borderRadius: 2, backgroundColor: "#534AB7" },
});