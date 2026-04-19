import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "./firebaseConfig";
import { useRouter } from "expo-router";

const ROLE_CONFIG = {
  admin:               { label: "Admin",        color: "#AFA9EC", bg: "#26215C" },
  worker_expert:       { label: "Expert",       color: "#5DCAA5", bg: "#085041" },
  worker_intermediate: { label: "Intermediate", color: "#EF9F27", bg: "#412402" },
  worker_beginner:     { label: "Beginner",     color: "#85B7EB", bg: "#042C53" },
};

function getRoleStyle(role_id) {
  return ROLE_CONFIG[role_id] || { label: role_id || "Unknown", color: "#888780", bg: "#2C2C2A" };
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ["#26215C", "#085041", "#412402", "#042C53", "#3B6D11"];
function getAvatarColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
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

  useEffect(() => {
    fetchUsers();
  }, []);

  const deleteUser = (id, name) => {
    Alert.alert(
      "Delete User",
      `Are you sure you want to delete ${name || "this user"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "Users", id));
              fetchUsers();
            } catch (error) {
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
    const avatarBg = getAvatarColor(item.id);

    return (
      <View style={styles.userCard}>
        <View style={styles.cardTop}>
          <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
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
            <Ionicons name="pencil-outline" size={14} color="#AFA9EC" />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => deleteUser(item.id, item.username)}
            activeOpacity={0.75}
          >
            <Ionicons name="trash-outline" size={14} color="#ff6b6b" />
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={18} color="#AFA9EC" />
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <Text style={styles.topLabel}>MANAGEMENT</Text>
            <Text style={styles.topTitle}>Users</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{users.length}</Text>
          </View>
        </View>

        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="people-outline" size={40} color="#3a3a50" />
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
        />

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
  safeArea:       { flex: 1, backgroundColor: "#13131a" },
  container:      { flex: 1, backgroundColor: "#13131a", paddingHorizontal: 16, paddingTop: 16 },
  topBar:         { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backBtn:        { width: 36, height: 36, borderRadius: 10, backgroundColor: "#1c1c26", borderWidth: 0.5, borderColor: "#2a2a38", alignItems: "center", justifyContent: "center" },
  topCenter:      { flex: 1, alignItems: "center" },
  topLabel:       { fontSize: 10, color: "#6b6b80", letterSpacing: 1.2 },
  topTitle:       { fontSize: 18, fontWeight: "500", color: "#ffffff" },
  countBadge:     { width: 36, height: 36, borderRadius: 10, backgroundColor: "#26215C", alignItems: "center", justifyContent: "center" },
  countText:      { fontSize: 13, fontWeight: "500", color: "#AFA9EC" },
  listContent:    { paddingBottom: 100 },
  userCard:       { backgroundColor: "#1c1c26", borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: "#2a2a38" },
  cardTop:        { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar:         { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  avatarText:     { color: "#fff", fontSize: 14, fontWeight: "500" },
  userInfo:       { flex: 1 },
  userName:       { fontSize: 14, fontWeight: "500", color: "#e8e8f0", marginBottom: 2 },
  userEmail:      { fontSize: 11, color: "#6b6b80" },
  roleBadge:      { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  roleText:       { fontSize: 10, fontWeight: "500" },
  divider:        { height: 0.5, backgroundColor: "#2a2a38", marginVertical: 12 },
  actions:        { flexDirection: "row", gap: 8 },
  editBtn:        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#26215C", borderRadius: 8, paddingVertical: 8 },
  editBtnText:    { color: "#AFA9EC", fontSize: 12, fontWeight: "500" },
  deleteBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#2a1a1a", borderRadius: 8, paddingVertical: 8, borderWidth: 0.5, borderColor: "#3a1a1a" },
  deleteBtnText:  { color: "#ff6b6b", fontSize: 12, fontWeight: "500" },
  emptyWrap:      { alignItems: "center", marginTop: 60, gap: 12 },
  emptyText:      { color: "#3a3a50", fontSize: 14 },
  addBtn:         { position: "absolute", bottom: 24, left: 16, right: 16, backgroundColor: "#534AB7", borderRadius: 14, height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  addBtnText:     { color: "#ffffff", fontSize: 15, fontWeight: "600" },
});