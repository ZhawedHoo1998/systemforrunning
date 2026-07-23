import { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { authApi } from '../api';
import { useAuthStore } from '../store';
import { useNavigate } from 'react-router-dom';
import styled from './Login.module.css';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const onFinish = async (values: { login: string; password: string }) => {
    setLoading(true);
    try {
      const res = await authApi.login(values.login, values.password);
      setAuth(res.data.token, res.data.user);
      message.success('登录成功');
      navigate('/');
    } catch (err: any) {
      message.error(err.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styled.container}>
      <Card className={styled.card}>
        <h1 className={styled.title}>香氛内容运营中台</h1>
        <p className={styled.subtitle}>Fragrance Content Hub</p>
        <Form onFinish={onFinish} layout="vertical" size="large">
          <Form.Item
            name="login"
            rules={[{ required: true, message: '请输入手机号或邮箱' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="手机号或邮箱" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
