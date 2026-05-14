import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { C } from '../theme';

export default function AdminScreen() {
  const router = useRouter();

  // ── Auth gate — nothing renders until confirmed admin ─────────
  const [authorized,    setAuthorized]    = useState(false);

  const [userCount,     setUserCount]     = useState(0);
  const [activePercent, setActivePercent] = useState(0);
  const [alertsCount,   setAlertsCount]   = useState(0);
  const [sessionCount,  setSessionCount]  = useState(0);
  const [pendingCount,  setPendingCount]  = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const init = async () => {
        // ── Role guard ────────────────────────────────────────────
        try {
          const raw  = await AsyncStorage.getItem('user');
          const user = JSON.parse(raw || '{}');
          if (user?.role !== 'admin') {
            router.replace('/dashboard');
            return;
          }
          if (!cancelled) setAuthorized(true);
        } catch (e) {
          console.warn('[Admin] Auth check failed:', e);
          router.replace('/dashboard');
          return;
        }

        // ── Fetch metrics ─────────────────────────────────────────
        try {
          const userSnapshot = await getDocs(collection(db, "Users"));
          const users = userSnapshot.docs.map(d => d.data());
          if (!cancelled) {
            setUserCount(users.length);
            const active = users.filter(u => u.isActive).length;
            setActivePercent(users.length ? Math.round((active / users.length) * 100) : 0);
          }

          const alertsSnapshot = await getDocs(collection(db, "Alerts"));
          if (!cancelled) setAlertsCount(alertsSnapshot.size);

          const logsSnapshot = await getDocs(collection(db, "audit_logs"));
          const logs = logsSnapshot.docs.map(d => d.data());
          if (!cancelled) {
            setSessionCount(logs.length);
            setPendingCount(logs.filter(l => l.status === 'pending_review').length);
          }
        } catch (error) {
          console.error("Admin metrics error:", error);
        }
      };
      init();
      // Reset gate when screen loses focus so re-entry re-verifies
      return () => { cancelled = true; setAuthorized(false); };
    }, [router])
  );

  const handleLogout = async () => {
    await AsyncStorage.removeItem("user");
    router.replace("/login");
  };

  // ── Block render until authorized ────────────────────────────
  if (!authorized) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const menuItems = [
    {
      key: "users",
      title: "User Management",
      sub: "Accounts & roles",
      icon: "people-outline",
      badge: `${userCount} users`,
      onPress: () => router.push("/usermanagement"),
    },
    {
      key: "analytics",
      title: "Analytics",
      sub: "Queries, approvals & user stats",
      icon: "bar-chart-outline",
      badge: "Live",
      onPress: () => router.push("/analytics"),
    },
    {
      key: "logs",
      title: "Audit Logs",
      sub: "Session history & HITL review",
      icon: "document-text-outline",
      badge: pendingCount > 0 ? `${pendingCount} pending` : "0 pending",
      onPress: () => router.push("/history"),
    },
    {
      key: "activity",
      title: "Activity Feed",
      sub: "Real-time alerts & events",
      icon: "notifications-outline",
      badge: alertsCount > 0 ? `${alertsCount} alerts` : "0 alerts",
      onPress: () => router.push("/activity"),
    },
    {
      key: "tasks",
      title: "Maintenance Tasks",
      sub: "Create & assign tasks to workers",
      icon: "checkmark-circle-outline",
      badge: "Tasks",
      onPress: () => router.push("/tasks"),
    },
    {
      key: "documents",
      title: "RAG Document Library",
      sub: "View manuals loaded in vector store",
      icon: "library-outline",
      badge: "RAG",
      onPress: () => router.push("/documents"),
    },
    {
      key: "ai",
      title: "AI Agent Config",
      sub: "System agents & settings",
      icon: "settings-outline",
      badge: "Live",
      onPress: () => {},
    },
    {
      key: "chat",
      title: "Maintenance Copilot",
      sub: "AI-powered chat assistant",
      icon: "chatbubble-ellipses-outline",
      badge: "AI",
      onPress: () => router.push("/dashboard"),
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.container}>

          {/* ── Top Bar ───────────────────────────────────────────── */}
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

          {/* ── Stats Grid ────────────────────────────────────────── */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>USERS</Text>
              <Text style={styles.statValue}>{userCount}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>ACTIVE</Text>
              <Text style={styles.statValue}>{activePercent}%</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>SESSIONS</Text>
              <Text style={styles.statValue}>{sessionCount}</Text>
            </View>
            <View style={[styles.statCard, pendingCount > 0 && styles.statCardWarning]}>
              <Text style={styles.statLabel}>PENDING</Text>
              <Text style={[styles.statValue, pendingCount > 0 && { color: '#fcd34d' }]}>
                {pendingCount}
              </Text>
            </View>
          </View>

          {/* ── Section Label ─────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>MANAGEMENT</Text>

          {/* ── Menu Cards ────────────────────────────────────────── */}
          {menuItems.map(item => (
            <TouchableOpacity
              key={item.key}
              style={styles.menuCard}
              onPress={item.onPress}
              activeOpacity={0.75}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={item.icon} size={20} color="#c4b5fd" />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSub}>{item.sub}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.badge}</Text>
              </View>
            </TouchableOpacity>
          ))}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:        { flex: 1, backgroundColor: "#f5f3ff" },
  container:       { flex: 1, backgroundColor: "#f5f3ff", paddingHorizontal: 16, paddingTop: 16 },
  topBar:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  greeting:        { fontSize: 10, color: "#7c3aed", fontWeight: "700", letterSpacing: 1.5, marginBottom: 2 },
  topBarTitle:     { fontSize: 22, fontWeight: "800", color: "#1e1b4b" },
  logoutBtn:       { flexDirection: "row", alignItems: "center", backgroundColor: "#fef2f2", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 4 },
  logoutText:      { color: "#f87171", fontWeight: "700", fontSize: 13 },
  statsGrid:       { flexDirection: "row", gap: 8, marginBottom: 24 },
  statCard:        { flex: 1, backgroundColor: "#7c3aed", borderRadius: 12, padding: 12, alignItems: "center" },
  statCardWarning: { backgroundColor: "#92400e" },
  statLabel:       { fontSize: 9, color: "#c4b5fd", fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  statValue:       { fontSize: 20, fontWeight: "800", color: "#fff" },
  sectionLabel:    { fontSize: 10, fontWeight: "700", color: "#7c3aed", letterSpacing: 1.5, marginBottom: 12 },
  menuCard:        { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#ede9fe", shadowColor: "#7c3aed", shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  iconWrap:        { width: 40, height: 40, borderRadius: 12, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center", marginRight: 12 },
  cardText:        { flex: 1 },
  cardTitle:       { fontSize: 14, fontWeight: "700", color: "#1e1b4b", marginBottom: 2 },
  cardSub:         { fontSize: 11, color: "#6b7280" },
  badge:           { backgroundColor: "#ede9fe", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText:       { fontSize: 10, fontWeight: "700", color: "#7c3aed" },
});