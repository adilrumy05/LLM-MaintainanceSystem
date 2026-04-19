import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from "react-native";
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

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const userSnapshot = await getDocs(collection(db, "Users"));
        const users = userSnapshot.docs.map((doc) => doc.data());
        setUserCount(users.length);
        const activeUsers = users.filter((u) => u.isActive).length;
        setActivePercent(users.length ? Math.round((activeUsers / users.length) * 100) : 0);
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
      iconColor: "#c4b5fd",
      iconBg: "#3b0764",
      badge: `${userCount}`,
      badgeColor: "#c4b5fd",
      badgeBg: "#3b0764",
      onPress: () => router.push("/usermanagement"),
    },
    {
      key: "ai",
      title: "AI Agent Config",
      sub: "System agents & settings",
      icon: "settings-outline",
      iconColor: "#c4b5fd",
      iconBg: "#3b0764",
      badge: "Live",
      badgeColor: "#c4b5fd",
      badgeBg: "#3b0764",
      onPress: () => {},
    },
    {
      key: "logs",
      title: "Audit Logs",
      sub: "Activity & changes",
      icon: "document-text-outline",
      iconColor: "#c4b5fd",
      iconBg: "#3b0764",
      badge: alertsCount > 0 ? `${alertsCount} new` : "0 new",
      badgeColor: "#c4b5fd",
      badgeBg: "#3b0764",
      onPress: () => router.push("/history"),
    },
    {
      key: "chat",
      title: "Maintenance Copilot",
      sub: "AI-powered chat assistant",
      icon: "chatbubble-ellipses-outline",
      iconColor: "#c4b5fd",
      iconBg: "#3b0764",
      badge: "AI",
      badgeColor: "#c4b5fd",
      badgeBg: "#3b0764",
      onPress: () => router.push("/dashboard"),
    },
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
            <Ionicons name="log-out-outline" size={18} color="#f87171" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>USERS</Text>
            <Text style={[styles.statValue, { color: "#c4b5fd" }]}>{userCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>ACTIVE</Text>
            <Text style={[styles.statValue, { color: "#c4b5fd" }]}>{activePercent}%</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>ALERTS</Text>
            <Text style={[styles.statValue, { color: "#c4b5fd" }]}>{alertsCount}</Text>
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
            <View style={[styles.badge, { backgroundColor: item.badgeBg }]}>
              <Text style={[styles.badgeText, { color: item.badgeColor }]}>
                {item.badge}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:     { flex: 1, backgroundColor: "#f5f3ff" },
  container:    { flex: 1, backgroundColor: "#f5f3ff", paddingHorizontal: 16, paddingTop: 16 },
  topBar:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  greeting:     { fontSize: 10, color: "#7c3aed", letterSpacing: 1.2, marginBottom: 2, fontWeight: "700" },
  topBarTitle:  { fontSize: 22, fontWeight: "700", color: "#1e1b4b" },
  logoutBtn:    { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fef2f2", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#fecaca" },
  logoutText:   { color: "#f87171", fontSize: 12, fontWeight: "600" },
  statsRow:     { flexDirection: "row", gap: 8, marginBottom: 20 },
  statCard:     { flex: 1, backgroundColor: "#7c3aed", borderRadius: 14, padding: 12 },
  statLabel:    { fontSize: 9, color: "#ddd6fe", letterSpacing: 0.8, marginBottom: 6, fontWeight: "700" },
  statValue:    { fontSize: 22, fontWeight: "700" },
  sectionLabel: { fontSize: 10, color: "#7c3aed", letterSpacing: 1.2, marginBottom: 12, fontWeight: "700" },
  menuCard:     { backgroundColor: "#ffffff", borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 10, borderWidth: 1, borderColor: "#ede9fe", elevation: 2 },
  iconWrap:     { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardText:     { flex: 1 },
  cardTitle:    { fontSize: 14, fontWeight: "600", color: "#1e1b4b", marginBottom: 2 },
  cardSub:      { fontSize: 11, color: "#7c3aed" },
  badge:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:    { fontSize: 11, fontWeight: "600" },
});