import { useState } from 'react';
import { Layout as AntLayout, Menu, Avatar, Dropdown, Badge, Button } from 'antd';
import {
  DashboardOutlined,
  BulbOutlined,
  FolderOutlined,
  ShopOutlined,
  FileTextOutlined,
  ReadOutlined,
  BarChartOutlined,
  BellOutlined,
  TeamOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store';
import { authApi, notificationApi } from '../api';
import { useEffect } from 'react';

const { Header, Sider, Content } = AntLayout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/ideas', icon: <BulbOutlined />, label: '选题创意' },
  { key: '/materials', icon: <FolderOutlined />, label: '素材中心' },
  { key: '/products', icon: <ShopOutlined />, label: '产品与车型' },
  { key: '/tasks', icon: <FileTextOutlined />, label: '内容任务' },
  { key: '/notes', icon: <ReadOutlined />, label: '发布笔记' },
  { key: '/dashboard', icon: <BarChartOutlined />, label: '数据看板' },
  { key: '/notifications', icon: <BellOutlined />, label: '通知中心' },
  { key: '/members', icon: <TeamOutlined />, label: '成员管理' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await notificationApi.list({ isRead: false, pageSize: 1 });
        setUnreadCount(res.data.unreadCount);
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {}
    logout();
    navigate('/login');
  };

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: '个人信息' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  const handleUserMenuClick = ({ key }: any) => {
    if (key === 'logout') {
      handleLogout();
    }
  };

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        style={{ borderRight: '1px solid #f0f0f0' }}
      >
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: collapsed ? 16 : 18, fontWeight: 600, color: '#667eea' }}>
          {collapsed ? '香氛' : '香氛内容运营中台'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <AntLayout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderBottom: '1px solid #f0f0f0' }}>
          <Badge count={unreadCount} size="small">
            <Button
              type="text"
              icon={<BellOutlined style={{ fontSize: 20 }} />}
              onClick={() => navigate('/notifications')}
            />
          </Badge>
          <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight" style={{ marginLeft: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginLeft: 16 }}>
              <Avatar style={{ backgroundColor: '#667eea' }}>
                {user?.name?.charAt(0) || 'U'}
              </Avatar>
              <span style={{ marginLeft: 8 }}>{user?.name}</span>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24, background: '#f5f5f5', minHeight: 'calc(100vh - 64px)' }}>
          {children}
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
