require 'resolv'
require 'securerandom'

require_relative 'spec_helper'

# page-404 is a Worker on *.toby.codes / *.tobys.cloud. It only runs when a
# hostname resolves through Cloudflare. Without wildcard DNS, random
# subdomains NXDOMAIN and there is nothing to HTTP-test.
describe 'page-404', type: :feature do
  def random_hostname(domain)
    "#{SecureRandom.hex(4)}.#{domain}"
  end

  def resolves?(hostname)
    addrs = Resolv.getaddresses(hostname)
    !addrs.empty?
  rescue Resolv::ResolvError, Resolv::ResolvTimeout, SocketError
    false
  end

  def get_allowing_404(url)
    agent.get(url)
  rescue Mechanize::ResponseCodeError => e
    raise e unless e.response_code.to_i == 404

    e.page
  end

  %w[toby.codes tobys.cloud].each do |domain|
    describe domain do
      it 'serves the branded 404 on an unused subdomain when DNS exists' do
        host = random_hostname(domain)
        unless resolves?(host)
          skip "no DNS for #{host} (wildcard not configured for #{domain})"
        end

        page = get_allowing_404("https://#{host}/")
        expect(page.code.to_i).to eq(404)
        expect(page.link.text).to eq('www.toby.codes')
      end
    end
  end

  # Known hosts on these zones must not be swallowed by the catch-all.
  describe 'does not steal real hosts' do
    {
      'https://www.toby.codes/' => 200,
      'https://assets.tobys.cloud/styles.css' => 200,
    }.each do |url, code|
      it "leaves #{url} alone" do
        page = agent.get(url)
        expect(page.code.to_i).to eq(code)
      end
    end
  end
end
