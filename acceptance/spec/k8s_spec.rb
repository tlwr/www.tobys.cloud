require 'k8s-ruby'

require_relative 'spec_helper'

describe 'kubernetes', type: :feature do
  let(:ns) { 'sites' }
  let(:pod_name) { 'acceptance-tests-static-busybox' }

  let(:client) do
    bzl_ext_kubeconfig = Dir.glob('../**/*/kubeconfig.yaml').first

    return K8s::Client.config(K8s::Config.load_file(bzl_ext_kubeconfig)) if File.exist?(bzl_ext_kubeconfig)

    if ENV['KUBECONFIG']
      return K8s::Client.in_cluster_config
    elsif ENV['USER'] == 'toby'
      return K8s::Client.config(K8s::Config.load_file(File.expand_path '~/.kube/config'))
    else
      return K8s::Client.in_cluster_config
    end
  end

  def delete_pod
    until get_pod.nil? do
      begin
        client.api('v1').resource('pods', namespace: ns).delete(pod_name)
      rescue K8s::Error::NotFound, K8s::Error::Conflict
        sleep 1
      end
    end
  end

  def get_pod
    client
      .api('v1')
      .resource('pods', namespace: ns)
      .list
      .select { _1.metadata.name == pod_name }
      .first
  end

  def create_pod
    client.api('v1').resource('pods', namespace: ns).create_resource(
      K8s::Resource.new({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          namespace: ns,
          name: pod_name,
        },
        spec: {
          containers: [
            {
              name: 'busybox',
              image: 'busybox',
              command: %w(sleep 300),
            },
          ],
          terminationGracePeriodSeconds: 0,
        },
      })
    )
  end

  before :each do
    delete_pod
  end

  after :each do
    delete_pod
  end

  it 'can push a pod which becomes ready' do
    num_checks = 10
    running = false

    create_pod

    num_checks.times do
      pod = get_pod

      if pod.nil?
        sleep 1
        next
      end

      if pod.status.phase == 'Running'
        running = true
        break
      end

      sleep 1
    end

    expect(running).to be(true), "pod did not become ready after #{num_checks} checks"
  end
end
