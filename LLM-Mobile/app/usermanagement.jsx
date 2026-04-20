import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Alert, SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useRouter } from "expo-router";

const ROLE_CONFIG = {
  admin:               { label: "Admin",        color: "#7c3aed", bg: "#ede9fe" },
  worker_expert:       { label: "Expert",       color: "#7c3aed", bg: "#ede9fe" },
  worker_intermediate: { label: "Intermediate", color: "#7c3aed", bg: "#ede9fe" },
  worker_beginner:     { label: "Beginner",     color: "#7c3aed", bg: "#ede9fe" },
};

function getRoleStyle(role_id) {
  return ROLE_CONFIG[role_id] || { label: role_id || "Unknown", color: "#7c3aed", bg: "#ede9fe" };
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

export default function UserManagementScreen() {
  const router = useRouter();
  const [users, setUsers] = useState([]);

  const fetchUsers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "Users"));
      const userList = querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setUsers(userList);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const deleteUser = (id, name) => {
    Alert.alert(
      "Delete User",
      `Are you sure you want to delete ${name || "this user"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "Users", id));
              fetchUsers();
            } catch {
              Alert.alert("Error", "Could not delete user.");
            }
          },
        },
      ]
    );
  };

  const renderUser = ({ item }) => {
    const role = getRoleStyle(item.role_id);
    const initials = getInitials(item.username);

    return (
      <View style={styles.userCard}>
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{item.username || "Unnamed User"}</Text>
            <Text style={styles.userEmail}>{item.email || "No email"}</Text>
          </View>
          <View style={[styles.roleBadge, { backgroundColor: role.bg }]}>
            <Text style={[styles.roleText, { color: role.color }]}>{role.label}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push({ pathname: '/userform', params: { user: JSON.stringify(item) } })}
            activeOpacity={0.75}
          >
            <Ionicons name="pencil-outline" size={14} color="#7c3aed" />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => deleteUser(item.id, item.username)}
            activeOpacity={0.75}
          >
            <Ionicons name="trash-outline" size={14} color="#f87171" />
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={18} color="#7c3aed" />
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <Text style={styles.topLabel}>MANAGEMENT</Text>
            <Text style={styles.topTitle}>Users</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchUsers}>
              <Ionicons name="refresh-outline" size={18} color="#7c3aed" />
            </TouchableOpacity>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{users.length}</Text>
            </View>
          </View>
        </View>

        {/* List */}
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="people-outline" size={40} color="#c4b5fd" />
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
        />

        {/* Add Button */}
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/userform')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Add New User</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: "#f5f3ff" },
  container:     { flex: 1, backgroundColor: "#f5f3ff", paddingHorizontal: 16, paddingTop: 16 },
  topBar:        { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backBtn:       { width: 36, height: 36, borderRadius: 10, backgroundColor: "#ede9fe", borderWidth: 1, borderColor: "#ddd6fe", alignItems: "center", justifyContent: "center" },
  refreshBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: "#ede9fe", borderWidth: 1, borderColor: "#ddd6fe", alignItems: "center", justifyContent: "center" },
  topCenter:     { flex: 1, alignItems: "center" },
  topLabel:      { fontSize: 10, color: "#7c3aed", letterSpacing: 1.2, fontWeight: "700" },
  topTitle:      { fontSize: 18, fontWeight: "700", color: "#1e1b4b" },
  countBadge:    { width: 36, height: 36, borderRadius: 10, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center" },
  countText:     { fontSize: 13, fontWeight: "700", color: "#ffffff" },
  listContent:   { paddingBottom: 100 },
  userCard:      { backgroundColor: "#ffffff", borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#ede9fe", elevation: 1 },
  cardTop:       { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar:        { width: 42, height: 42, borderRadius: 12, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center" },
  avatarText:    { color: "#fff", fontSize: 14, fontWeight: "700" },
  userInfo:      { flex: 1 },
  userName:      { fontSize: 14, fontWeight: "600", color: "#1e1b4b", marginBottom: 2 },
  userEmail:     { fontSize: 11, color: "#7c3aed" },
  roleBadge:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  roleText:      { fontSize: 11, fontWeight: "600" },
  divider:       { height: 1, backgroundColor: "#ede9fe", marginVertical: 12 },
  actions:       { flexDirection: "row", gap: 8 },
  editBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#ede9fe", borderRadius: 10, paddingVertical: 10 },
  editBtnText:   { color: "#7c3aed", fontSize: 13, fontWeight: "600" },
  deleteBtn:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fef2f2", borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: "#fecaca" },
  deleteBtnText: { color: "#f87171", fontSize: 13, fontWeight: "600" },
  emptyWrap:     { alignItems: "center", marginTop: 60, gap: 12 },
  emptyText:     { color: "#c4b5fd", fontSize: 14 },
  addBtn:        { position: "absolute", bottom: 24, left: 16, right: 16, backgroundColor: "#7c3aed", borderRadius: 14, height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  addBtnText:    { color: "#ffffff", fontSize: 15, fontWeight: "600" },
});


